import fs from "node:fs/promises";
import path from "node:path";
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

const toSafeExt = (contentType, imageUrl) => {
  const byUrl = path.extname(new URL(imageUrl).pathname).toLowerCase();
  if (byUrl && byUrl.length <= 5) return byUrl;

  if (!contentType) return ".img";
  if (contentType.includes("jpeg")) return ".jpg";
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("gif")) return ".gif";
  if (contentType.includes("bmp")) return ".bmp";
  if (contentType.includes("avif")) return ".avif";
  return ".img";
};

const downloadOne = async (image, jobDir) => {
  try {
    if (shouldSkipByAlt(image.imageAlt)) {
      return image;
    }

    if (isTooSmall(image.width, image.height)) {
      return image;
    }

    const response = await fetch(image.imageSrc);
    if (!response.ok) return image;
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
      return image;
    }

    const ext = toSafeExt(response.headers.get("content-type"), image.imageSrc);
    const baseName = `img_${image.id}`;
    const imageFileName = `${baseName}${ext}`;
    const metadataFileName = `${baseName}.json`;
    const imageAbsolutePath = path.join(jobDir, imageFileName);
    const metadataAbsolutePath = path.join(jobDir, metadataFileName);

    await fs.writeFile(imageAbsolutePath, buffer);
    const metadata = {
      imageId: image.id,
      downloadedAt: new Date().toISOString(),
      foundOnPageUrl: image.pageUrl,
      foundOnPageTitle: image.pageTitle,
      imageSourceUrl: image.imageSrc,
      imageAlt: image.imageAlt,
      renderedSize: {
        width: image.width,
        height: image.height,
      },
      actualSize: measured,
      download: {
        finalUrl: response.url,
        statusCode: response.status,
        contentType: response.headers.get("content-type"),
        byteLength: buffer.length,
      },
      files: {
        image: imageFileName,
        metadata: metadataFileName,
      },
    };
    await fs.writeFile(
      metadataAbsolutePath,
      JSON.stringify(metadata, null, 2),
      "utf8",
    );

    return {
      ...image,
      width: image.width || measured.width,
      height: image.height || measured.height,
      imageFile: imageAbsolutePath,
      imageMetadataFile: metadataAbsolutePath,
    };
  } catch (error) {
    logger.warn(`Failed to download image ${image.imageSrc}`, error);
    return image;
  }
};

export const downloadImagesForJob = async (jobId, images, dataPath) => {
  const jobDir = path.join(dataPath, "jobs", jobId, "images", "raw");
  await fs.mkdir(jobDir, { recursive: true });

  const eligible = images.filter((img) => !isTooSmall(img.width, img.height));
  const concurrency = 8;
  const output = [];
  for (let index = 0; index < eligible.length; index += concurrency) {
    const chunk = eligible.slice(index, index + concurrency);
    const downloaded = await Promise.all(
      chunk.map((item) => downloadOne(item, jobDir)),
    );
    output.push(...downloaded);
  }

  logger.info(`Downloaded images for job ${jobId}`, {
    total: images.length,
    eligible: eligible.length,
    withFile: output.filter((img) => Boolean(img.imageFile)).length,
    withMetadata: output.filter((img) => Boolean(img.imageMetadataFile)).length,
    storageDir: jobDir,
    minImage: {
      width: minImageWidth,
      height: minImageHeight,
      area: minImageArea,
    },
  });
  return output;
};
