import { imageSize } from "image-size";
import { logger } from "../utils/logger.js";
import { ensureEnvLoaded } from "../utils/env.js";

ensureEnvLoaded();

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const minImageWidth = toInt(process.env.MIN_IMAGE_WIDTH, 120);
const minImageHeight = toInt(process.env.MIN_IMAGE_HEIGHT, 80);
const minImageArea = toInt(process.env.MIN_IMAGE_AREA, 120 * 80);

const normalizeText = (value) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const shouldSkipByAlt = (alt) => {
  const normalizedAlt = normalizeText(alt || "");
  return normalizedAlt.includes("logotipo");
};

const isTooSmall = (width, height) => {
  if (width <= 0 || height <= 0) return false;
  return (
    width < minImageWidth ||
    height < minImageHeight ||
    width * height < minImageArea
  );
};

const fetchImageMetadata = async (image) => {
  try {
    if (shouldSkipByAlt(image.imageAlt)) {
      return {
        ...image,
        skipped: { reason: "alt_filtered" },
      };
    }

    if (isTooSmall(image.width, image.height)) {
      return {
        ...image,
        skipped: { reason: "too_small_rendered" },
      };
    }

    const response = await fetch(image.sourceUrl);
    if (!response.ok) {
      return {
        ...image,
        fetch: {
          status: "error",
          statusCode: response.status,
          finalUrl: response.url,
        },
      };
    }
    const buffer = Buffer.from(await response.arrayBuffer());

    const measured = (() => {
      try {
        const { width, height } = imageSize(buffer);
        return { width: width ?? 0, height: height ?? 0 };
      } catch {
        return { width: 0, height: 0 };
      }
    })();
    if (isTooSmall(measured.width, measured.height)) {
      return {
        ...image,
        skipped: { reason: "too_small_actual" },
      };
    }

    return {
      ...image,
      width: image.width || measured.width,
      height: image.height || measured.height,
      size: {
        width: measured.width || image.width || 0,
        height: measured.height || image.height || 0,
        bytes: buffer.length,
      },
      fetch: {
        status: "ok",
        statusCode: response.status,
        contentType: response.headers.get("content-type"),
        finalUrl: response.url,
      },
    };
  } catch (error) {
    logger.warn(`Failed to fetch metadata for image ${image.sourceUrl}`, error);
    return {
      ...image,
      fetch: {
        status: "error",
      },
    };
  }
};

export const downloadImagesForJob = async (jobId, images) => {
  const eligible = images.filter((img) => !isTooSmall(img.width, img.height));
  const concurrency = 8;
  const output = [];
  for (let index = 0; index < eligible.length; index += concurrency) {
    const chunk = eligible.slice(index, index + concurrency);
    const downloaded = await Promise.all(
      chunk.map((item) => fetchImageMetadata(item)),
    );
    output.push(...downloaded);
  }

  logger.info(`Fetched image metadata for job ${jobId}`, {
    total: images.length,
    eligible: eligible.length,
    fetchSuccess: output.filter((img) => img.fetch?.status === "ok").length,
    minImage: {
      width: minImageWidth,
      height: minImageHeight,
      area: minImageArea,
    },
  });
  return output;
};
