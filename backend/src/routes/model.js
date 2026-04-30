import { Router } from "express";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { detectTablesInImage } from "../services/tableDetector.js";
import { ensureEnvLoaded, resolveDataPath } from "../utils/env.js";

export const modelRouter = Router();

ensureEnvLoaded();
const dataPath = resolveDataPath(process.env.DATA_PATH);

const extFromContentType = (contentType) => {
  if (!contentType) return ".img";
  const ct = contentType.toLowerCase();
  if (ct.includes("png")) return ".png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return ".jpg";
  if (ct.includes("webp")) return ".webp";
  if (ct.includes("gif")) return ".gif";
  if (ct.includes("bmp")) return ".bmp";
  if (ct.includes("avif")) return ".avif";
  return ".img";
};

// POST /api/model/table-detect
modelRouter.post("/table-detect", async (req, res) => {
  const contentType = req.headers["content-type"];
  const buffer = req.body;

  if (!buffer || !(buffer instanceof Buffer) || buffer.length === 0) {
    res
      .status(400)
      .json({
        error: "Missing image body. Send raw bytes with Content-Type: image/*.",
      });
    return;
  }

  if (buffer.length > 15 * 1024 * 1024) {
    res.status(413).json({ error: "Image too large. Max 15MB." });
    return;
  }

  const tmpDir = path.join(dataPath, "tmp");
  await fsp.mkdir(tmpDir, { recursive: true });

  const id = crypto.randomUUID();
  const tmpPath = path.join(
    tmpDir,
    `upload_${id}${extFromContentType(String(contentType || ""))}`,
  );

  const startedAt = Date.now();
  try {
    await fsp.writeFile(tmpPath, buffer);
    const result = await detectTablesInImage(tmpPath);
    const elapsedMs = Date.now() - startedAt;

    res.json({
      ok: true,
      elapsedMs,
      threshold: null,
      model: result?.model,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  } finally {
    await fsp.rm(tmpPath, { force: true }).catch(() => {});
  }
});
