import { logger } from "../utils/logger.js";
import { ensureEnvLoaded } from "../utils/env.js";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveDataPath } from "../utils/env.js";

ensureEnvLoaded();
const dataPath = resolveDataPath(process.env.DATA_PATH);

const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
const ollamaModel = process.env.OLLAMA_MODEL || "qwen2.5vl:7b";

const parseModelJson = (text) => {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // Try to extract the first JSON object from the response.
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
};

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * Ask an Ollama vision model if an image contains a table.
 * Returns a binary classification (no bounding boxes).
 */
export const detectTablesInImage = async (imagePath) => {
  const startedAt = Date.now();
  const imageBase64 = (await fs.readFile(imagePath)).toString("base64");

  const prompt =
    'Responde APENAS com JSON válido no formato {"hasTable": true|false, "confidence": 0.0-1.0}. ' +
    "Considera que existe tabela apenas se houver dados organizados em linhas/colunas (grelha), " +
    "como tabelas, horários, matrizes ou tabelas de preços. Se não houver, hasTable=false.";

  const payload = {
    model: ollamaModel,
    stream: false,
    messages: [
      {
        role: "user",
        content: prompt,
        images: [imageBase64],
      },
    ],
    options: {
      temperature: 0,
    },
  };

  let response;
  try {
    response = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    logger.warn("Failed to reach Ollama", { ollamaUrl, message: error?.message });
    throw error;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Ollama HTTP ${response.status}: ${text || "request failed"}`);
  }

  const raw = await response.json();
  const content =
    raw?.message?.content ??
    raw?.response ??
    raw?.output ??
    "";
  const parsed = parseModelJson(content);
  const hasTable = Boolean(parsed?.hasTable);
  const confidence = clamp01(
    typeof parsed?.confidence === "number" ? parsed.confidence : hasTable ? 0.7 : 0,
  );
  const elapsedMs = Date.now() - startedAt;

  return {
    hasTable,
    confidence: Math.round(confidence * 1000) / 1000,
    boundingBoxes: [],
    elapsedMs,
    model: ollamaModel,
  };
};

/**
 * Run table detection on all OCR-passed images in a job.
 * Images that did not pass OCR are skipped.
 */
export const detectTablesForJob = async (jobId, images, onProgress) => {
  let processed = 0;
  let detected = 0;
  const output = [];
  const tabelaDir = path.join(dataPath, "jobs", jobId, "images", "tabela");
  let tabelaDirEnsured = false;

  for (const image of images) {
    if (image.ocr?.status !== "passed" || !image.imageFile) {
      output.push({
        ...image,
        tableDetection: { status: "skipped" },
      });
      continue;
    }

    processed += 1;
    try {
      const result = await detectTablesInImage(image.imageFile);
      if (result.hasTable) detected += 1;

      if (result.hasTable) {
        if (!tabelaDirEnsured) {
          await fs.mkdir(tabelaDir, { recursive: true });
          tabelaDirEnsured = true;
        }

        // Copy (do not move) so we keep the original groups intact.
        const destImage = path.join(tabelaDir, path.basename(image.imageFile));
        await fs.copyFile(image.imageFile, destImage).catch(() => {});

        if (image.imageMetadataFile) {
          const destMeta = path.join(tabelaDir, path.basename(image.imageMetadataFile));
          await fs.copyFile(image.imageMetadataFile, destMeta).catch(() => {});
        }
      }

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
      logger.warn(`Table detection failed for ${image.imageFile}`, error);
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
    confidenceThresholdEnv,
  });

  return output;
};
