import { chromium } from "playwright";
import { logger } from "../utils/logger.js";
import { ensureEnvLoaded } from "../utils/env.js";

ensureEnvLoaded();

const SVG_EXTENSIONS = [".svg", ".svgz"];
const shouldIgnoreImage = (src) => {
  const normalized = src.toLowerCase();
  if (normalized.startsWith("data:image/svg+xml")) return true;
  try {
    const parsed = new URL(src);
    const pathname = parsed.pathname.toLowerCase();
    return SVG_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  } catch {
    return SVG_EXTENSIONS.some((ext) => normalized.endsWith(ext));
  }
};

const normalizeUrl = (url) => {
  const parsed = new URL(url);
  parsed.hash = "";
  [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "fbclid",
    "gclid",
  ].forEach((key) => parsed.searchParams.delete(key));
  return parsed.toString();
};

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const minImageWidth = toInt(process.env.MIN_IMAGE_WIDTH, 120);
const minImageHeight = toInt(process.env.MIN_IMAGE_HEIGHT, 80);
const minImageArea = toInt(process.env.MIN_IMAGE_AREA, 120 * 80);

const isTooSmall = (width, height) => {
  if (width <= 0 || height <= 0) return false;
  return (
    width < minImageWidth ||
    height < minImageHeight ||
    width * height < minImageArea
  );
};

export const crawlSite = async (targetUrl, options, callbacks) => {
  const origin = new URL(targetUrl).origin;
  const normalizedTarget = normalizeUrl(targetUrl);
  const queue = [{ url: normalizedTarget, depth: 0 }];
  const visited = new Set();
  const results = [];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "pt-PT",
  });

  try {
    while (queue.length > 0 && visited.size < options.maxPages) {
      const current = queue.shift();
      if (!current) continue;
      if (visited.has(current.url) || current.depth > options.maxDepth)
        continue;

      visited.add(current.url);
      callbacks.onPagesDiscovered(visited.size);
      logger.info(`Crawling page ${current.url}`, {
        depth: current.depth,
        visited: visited.size,
        pending: queue.length,
      });

      const page = await context.newPage();
      let ignoredSvg = 0;
      let ignoredSmall = 0;
      let withSrc = 0;
      let added = 0;
      const ignoredSvgSamples = [];
      const ignoredSmallSamples = [];

      try {
        await page.goto(current.url, {
          waitUntil: "domcontentloaded",
          timeout: options.pageTimeoutMs,
        });
        await page.waitForTimeout(1200);

        const title = await page.title();
        const extracted = await page.evaluate(() => {
          const pickSrcset = (srcset) => {
            const first = srcset
              .split(",")
              .map((entry) => entry.trim())
              .filter(Boolean)[0];
            return first ? first.split(/\s+/)[0] : "";
          };
          const getBg = (style) => {
            const match = /background-image\s*:\s*url\((['"]?)(.*?)\1\)/i.exec(
              style,
            );
            return match?.[2] ?? "";
          };

          const images = [];
          document.querySelectorAll("img").forEach((el) => {
            const img = el;
            if (img.closest("[class*='map-point']")) return;
            const src =
              img.currentSrc ||
              img.getAttribute("src") ||
              img.getAttribute("data-src") ||
              "";
            const srcset =
              img.getAttribute("srcset") ||
              img.getAttribute("data-srcset") ||
              "";
            const finalSrc = src || (srcset ? pickSrcset(srcset) : "");
            if (!finalSrc) return;
            const rect = img.getBoundingClientRect();
            images.push({
              src: finalSrc,
              alt: img.getAttribute("alt") || "",
              width: Math.round(rect.width) || img.naturalWidth || 0,
              height: Math.round(rect.height) || img.naturalHeight || 0,
            });
          });

          document.querySelectorAll("source").forEach((el) => {
            if (el.parentElement?.closest?.("[class*='map-point']")) return;
            const srcset =
              el.getAttribute("srcset") || el.getAttribute("data-srcset") || "";
            const src = srcset ? pickSrcset(srcset) : "";
            if (!src) return;
            images.push({ src, alt: "", width: 0, height: 0 });
          });

          document
            .querySelectorAll("[style*='background-image']")
            .forEach((el) => {
              if (el.closest("[class*='map-point']")) return;
              const src = getBg(el.getAttribute("style") || "");
              if (!src) return;
              images.push({ src, alt: "", width: 0, height: 0 });
            });

          const links = Array.from(document.querySelectorAll("a[href]"))
            .map((a) => a.getAttribute("href") || "")
            .filter(Boolean);

          return {
            images,
            links,
            totalImgTags: document.querySelectorAll("img").length,
          };
        });

        for (const img of extracted.images) {
          withSrc += 1;
          let absoluteSrc = "";
          try {
            absoluteSrc = normalizeUrl(
              new URL(img.src, current.url).toString(),
            );
          } catch {
            continue;
          }
          if (shouldIgnoreImage(absoluteSrc)) {
            ignoredSvg += 1;
            if (ignoredSvgSamples.length < 3) ignoredSvgSamples.push(img.src);
            continue;
          }
          if (isTooSmall(img.width, img.height)) {
            ignoredSmall += 1;
            if (ignoredSmallSamples.length < 3) {
              ignoredSmallSamples.push({
                src: img.src,
                width: img.width,
                height: img.height,
              });
            }
            continue;
          }
          results.push({
            id: `${results.length + 1}`,
            pageUrl: current.url,
            pageTitle: title,
            imageSrc: absoluteSrc,
            imageAlt: img.alt,
            width: img.width,
            height: img.height,
            hasTable: false,
          });
          added += 1;
        }

        logger.info(`Page analyzed ${current.url}`, {
          totalImgTags: extracted.totalImgTags,
          withSrc,
          ignoredSvg,
          ignoredSvgSamples,
          ignoredSmall,
          ignoredSmallSamples,
          addedOnPage: added,
          totalResultsOverall: results.length,
          minImage: {
            width: minImageWidth,
            height: minImageHeight,
            area: minImageArea,
          },
        });
        callbacks.onImagesFound(results.length);

        if (
          current.depth < options.maxDepth &&
          visited.size < options.maxPages
        ) {
          for (const href of extracted.links) {
            let normalizedNext = "";
            try {
              normalizedNext = normalizeUrl(
                new URL(href, current.url).toString(),
              );
              const parsed = new URL(normalizedNext);
              if (parsed.origin !== origin) continue;
              if (
                /\.(pdf|jpg|jpeg|png|webp|gif|zip|xml)$/i.test(parsed.pathname)
              )
                continue;
            } catch {
              continue;
            }
            if (
              visited.has(normalizedNext) ||
              queue.some((item) => item.url === normalizedNext)
            )
              continue;
            if (visited.size + queue.length >= options.maxPages) break;
            queue.push({ url: normalizedNext, depth: current.depth + 1 });
          }
        }
      } catch (error) {
        logger.warn(`Skipping page after crawl error ${current.url}`, error);
      } finally {
        callbacks.onPageProcessed();
        await page.close();
      }
    }

    return results;
  } finally {
    await context.close();
    await browser.close();
  }
};
