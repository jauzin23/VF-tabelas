import { Router } from "express";
import crypto from "node:crypto";
import { detectTablesInImage } from "../services/tableDetector.js";
import { ensureEnvLoaded } from "../utils/env.js";
import { logger } from "../utils/logger.js";

export const modelRouter = Router();

ensureEnvLoaded();

// POST /api/model/table-detect
modelRouter.post("/table-detect", async (req, res) => {
  const requestId = crypto.randomUUID().substring(0, 8);
  logger.info(`[${requestId}] POST /table-detect - Image upload received`);

  const file = req.file;
  const buffer = file?.buffer;

  logger.info(`[${requestId}] Request details`, {
    fileName: file?.originalname,
    mimeType: file?.mimetype,
    bufferSize: buffer?.length,
    isBuffer: buffer instanceof Buffer,
    bufferMagic: buffer?.slice(0, 8).toString("hex"),
  });

  if (!buffer || !(buffer instanceof Buffer) || buffer.length === 0) {
    logger.warn(`[${requestId}] Invalid buffer`, {
      fileExists: !!file,
      bufferExists: !!buffer,
      isBuffer: buffer instanceof Buffer,
      length: buffer?.length,
      bufferType: buffer?.constructor?.name,
    });
    res.status(400).json({
      error: "Missing image file. Upload with form-data key 'file'.",
    });
    return;
  }

  if (buffer.length > 15 * 1024 * 1024) {
    logger.warn(`[${requestId}] Image too large: ${buffer.length} bytes`);
    res.status(413).json({ error: "Image too large. Max 15MB." });
    return;
  }

  const startedAt = Date.now();
  try {
    logger.info(`[${requestId}] Starting table detection...`);
    const result = await detectTablesInImage(buffer, file?.mimetype);
    const elapsedMs = Date.now() - startedAt;

    logger.info(`[${requestId}] Detection successful`, {
      hasTable: result.hasTable,
      confidence: result.confidence,
      elapsedMs,
    });

    res.json({
      ok: true,
      elapsedMs,
      threshold: null,
      model: result?.model,
      ...result,
    });
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[${requestId}] Detection failed after ${elapsedMs}ms`, {
      error: message,
      stack: error?.stack,
    });
    res.status(500).json({ error: message });
  }
});
