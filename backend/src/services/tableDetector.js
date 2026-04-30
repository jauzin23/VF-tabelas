import { logger } from "../utils/logger.js";
import { ensureEnvLoaded } from "../utils/env.js";

ensureEnvLoaded();

const tableDetectorUrl =
  process.env.TABLE_DETECTOR_URL || "http://localhost:8000";

const tableDetectorTimeoutMs = Number.parseInt(
  process.env.TABLE_DETECTOR_TIMEOUT_MS ?? "",
  10,
);
const effectiveTableDetectorTimeoutMs = Number.isFinite(tableDetectorTimeoutMs)
  ? tableDetectorTimeoutMs
  : 180000;
const minTableConfidence = Number.parseFloat(
  process.env.TABLE_MIN_CONFIDENCE ?? "",
);
const effectiveMinTableConfidence = Number.isFinite(minTableConfidence)
  ? Math.max(0, Math.min(1, minTableConfidence))
  : 0.5;
const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const minImageWidth = toInt(process.env.MIN_IMAGE_WIDTH, 120);
const minImageHeight = toInt(process.env.MIN_IMAGE_HEIGHT, 80);
const minImageArea = toInt(process.env.MIN_IMAGE_AREA, 120 * 80);

const getImageDimensions = (image) => {
  const width = image.size?.width ?? image.width ?? 0;
  const height = image.size?.height ?? image.height ?? 0;
  return { width, height };
};

const isTooSmall = (width, height) => {
  if (width <= 0 || height <= 0) return false;
  return (
    width < minImageWidth ||
    height < minImageHeight ||
    width * height < minImageArea
  );
};

// Detect MIME type from buffer magic bytes
const detectMimeType = (buffer) => {
  if (buffer.length < 4) return null;

  // PNG: 89 50 4E 47
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // GIF: 47 49 46 38
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return "image/gif";
  }

  // WebP: RIFF ... WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46
  ) {
    if (
      buffer.length > 12 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return "image/webp";
    }
  }

  return null;
};

const getExtension = (mimeType) => {
  const map = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
  };
  return map[mimeType] || "jpg";
};

// Helper to create proper multipart/form-data body
const createMultipartBody = (buffer, mimeType, filename) => {
  const boundary = `----WebKitFormBoundary${Math.random().toString(36).substring(2, 15)}`;

  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    "utf-8",
  );

  const footer = Buffer.from(`\r\n--${boundary}--\r\n`, "utf-8");

  return {
    body: Buffer.concat([header, buffer, footer]),
    boundary,
  };
};

/**
 * Call the Table Detector API (Python FastAPI) to detect tables in an image.
 * Returns binary classification with confidence score.
 */
export const detectTablesInImage = async (imageInput, mimeType) => {
  const startedAt = Date.now();
  logger.info("[TableDetector] Starting table detection");

  let imageBuffer = null;
  try {
    if (Buffer.isBuffer(imageInput)) {
      imageBuffer = imageInput;
    } else if (typeof imageInput === "string") {
      const response = await fetch(imageInput);
      if (!response.ok) {
        throw new Error(`Failed to fetch image URL (${response.status})`);
      }
      imageBuffer = Buffer.from(await response.arrayBuffer());
    } else {
      throw new Error("Unsupported image input for table detection.");
    }
    logger.info(`[TableDetector] Image loaded: ${imageBuffer.length} bytes`);
  } catch (error) {
    logger.error("[TableDetector] Failed to load image input", error);
    throw error;
  }

  try {
    logger.info(
      `[TableDetector] Sending request to ${tableDetectorUrl}/detect-table`,
    );

    // Determine mime type: use provided, detect from buffer, or default
    const finalMimeType =
      mimeType || detectMimeType(imageBuffer) || "image/jpeg";
    const extension = getExtension(finalMimeType);
    const filename = `image.${extension}`;

    logger.info("[TableDetector] Sending image", {
      mimeType: finalMimeType,
      extension,
      filename,
      bufferSize: imageBuffer.length,
      providedMimeType: mimeType,
      bufferMagic: imageBuffer.slice(0, 8).toString("hex"),
    });

    // Create proper multipart/form-data body
    const { body, boundary } = createMultipartBody(
      imageBuffer,
      finalMimeType,
      filename,
    );

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      effectiveTableDetectorTimeoutMs,
    );
    const requestStartedAt = Date.now();

    try {
      const response = await fetch(`${tableDetectorUrl}/detect-table`, {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body: body,
        signal: controller.signal,
      });

      const requestMs = Date.now() - requestStartedAt;
      logger.info(`[TableDetector] API responded in ${requestMs}ms`, {
        status: response.status,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Table Detector HTTP ${response.status}: ${text || "request failed"}`,
        );
      }

      const result = await response.json();
      logger.info(
        `[TableDetector] Raw API Response:`,
        JSON.stringify(result, null, 2),
      );

      // Extract relevant data from Python API response (nested in details)
      const hasTable = Boolean(result.has_table);
      const details = result.details || {};
      const confidence =
        typeof details.average_confidence === "number"
          ? Math.max(0, Math.min(1, details.average_confidence))
          : 0;
      const tablesDetected = Number.isFinite(details.tables_detected)
        ? details.tables_detected
        : 0;

      // Apply confidence threshold
      const acceptTable = hasTable && confidence >= effectiveMinTableConfidence;

      logger.info(`[TableDetector] Detection complete`, {
        hasTable: acceptTable,
        confidence: confidence,
        tablesDetected,
        totalElapsedMs: Date.now() - startedAt,
      });

      return {
        hasTable: acceptTable,
        confidence: Math.round(confidence * 1000) / 1000,
        boundingBoxes: details.detections || [],
        elapsedMs: Date.now() - startedAt,
        model: "table-transformer-detection",
        tablesDetected,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    logger.error("[TableDetector] Detection failed", error);
    throw error;
  }
};

/**
 * Run table detection on all OCR-passed images in a job.
 * Images that did not pass OCR are skipped.
 */
export const detectTablesForJob = async (jobId, images, onProgress) => {
  let processed = 0;
  let detected = 0;
  const output = [];

  for (const image of images) {
    if (image.ocr?.status !== "passed" || !image.sourceUrl) {
      output.push({
        ...image,
        tableDetection: { status: "skipped" },
      });
      continue;
    }
    const { width, height } = getImageDimensions(image);
    if (isTooSmall(width, height)) {
      output.push({
        ...image,
        tableDetection: { status: "skipped", reason: "too_small" },
      });
      continue;
    }

    processed += 1;
    try {
      const result = await detectTablesInImage(image.sourceUrl);
      if (result.hasTable) detected += 1;

      output.push({
        ...image,
        hasTable: result.hasTable,
        tableDetection: {
          status: result.hasTable ? "detected" : "none",
          confidence: result.confidence,
          boundingBoxes: result.boundingBoxes,
        },
      });

      logger.info(`Table detection for image ${image.id}`, {
        hasTable: result.hasTable,
        confidence: result.confidence,
        boxes: result.boundingBoxes.length,
      });
    } catch (error) {
      logger.warn(`Table detection failed for ${image.sourceUrl}`, error);
      output.push({
        ...image,
        tableDetection: { status: "error" },
      });
    }

    onProgress?.(processed, detected);
  }

  logger.info("Table detection completed", {
    total: images.length,
    processed,
    detected,
  });

  return output;
};
