import { logger } from "../utils/logger.js";
import { ensureEnvLoaded } from "../utils/env.js";

ensureEnvLoaded();

const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";

const modelCandidates = String(
  process.env.OLLAMA_MODEL_CANDIDATES ||
    process.env.OLLAMA_MODEL ||
    "qwen2.5vl:3b,qwen2.5vl:7b",
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
let selectedModel = null;
const ollamaTimeoutMs = Number.parseInt(
  process.env.OLLAMA_TIMEOUT_MS ?? "",
  10,
);
const effectiveOllamaTimeoutMs = Number.isFinite(ollamaTimeoutMs)
  ? ollamaTimeoutMs
  : 90000;
const minTableConfidence = Number.parseFloat(
  process.env.TABLE_MIN_CONFIDENCE ?? "",
);
const effectiveMinTableConfidence = Number.isFinite(minTableConfidence)
  ? Math.max(0, Math.min(1, minTableConfidence))
  : 0.78;
const ollamaRetryAttemptsRaw = Number.parseInt(
  process.env.OLLAMA_RETRY_ATTEMPTS ?? "",
  10,
);
const ollamaRetryAttempts = Number.isFinite(ollamaRetryAttemptsRaw)
  ? Math.max(1, ollamaRetryAttemptsRaw)
  : 3;

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

const normalizeModelResult = (parsed) => {
  const hasTableRaw = Boolean(parsed?.hasTable);
  const confidenceRaw =
    typeof parsed?.confidence === "number"
      ? clamp01(parsed.confidence)
      : hasTableRaw
        ? 0.5
        : 0;
  const rows = Number.isFinite(parsed?.rows) ? Number(parsed.rows) : 0;
  const columns = Number.isFinite(parsed?.columns) ? Number(parsed.columns) : 0;
  const hasGrid =
    typeof parsed?.hasGrid === "boolean"
      ? parsed.hasGrid
      : rows >= 2 && columns >= 2;

  // Conservative acceptance gate to reduce false positives.
  const hasTable =
    hasTableRaw &&
    hasGrid &&
    rows >= 2 &&
    columns >= 2 &&
    confidenceRaw >= effectiveMinTableConfidence;

  return {
    hasTable,
    confidence: confidenceRaw,
    rows,
    columns,
    hasGrid,
  };
};

const buildPayload = (model, imageBase64) => {
  const prompt =
    "Responde APENAS com JSON válido no formato " +
    '{"hasTable": true|false, "confidence": 0..1, "hasGrid": true|false, "rows": number, "columns": number}. ' +
    "Marca hasTable=true apenas se existir grelha visível com pelo menos 2 linhas e 2 colunas. " +
    "Listas, parágrafos, cartões, botões, formulários, menus, infográficos e texto alinhado NÃO são tabela.";

  return {
    model,
    stream: false,
    keep_alive: "15m",
    format: "json",
    messages: [
      {
        role: "user",
        content: prompt,
        images: [imageBase64],
      },
    ],
    options: {
      temperature: 0,
      num_predict: 80,
    },
  };
};

const requestWithModel = async (model, imageBase64, imageSize) => {
  const payload = buildPayload(model, imageBase64);
  logger.info("[Ollama] Request config", {
    url: `${ollamaUrl}/api/chat`,
    model,
    imageSize,
    timeoutMs: effectiveOllamaTimeoutMs,
  });

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    effectiveOllamaTimeoutMs,
  );
  const requestStartedAt = Date.now();

  try {
    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const requestMs = Date.now() - requestStartedAt;
    logger.info(`[Ollama] Model ${model} responded in ${requestMs}ms`, {
      status: response.status,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Ollama HTTP ${response.status}: ${text || "request failed"}`,
      );
    }
    const raw = await response.json();
    const content = raw?.message?.content ?? raw?.response ?? raw?.output ?? "";
    return { raw, content };
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Ask an Ollama vision model if an image contains a table.
 * Returns a binary classification (no bounding boxes).
 */
export const detectTablesInImage = async (imageInput) => {
  const startedAt = Date.now();
  logger.info("[Ollama] Starting table detection");

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
    logger.info(`[Ollama] Image loaded: ${imageBuffer.length} bytes`);
  } catch (error) {
    logger.error("[Ollama] Failed to load image input", error);
    throw error;
  }

  const imageBase64 = imageBuffer.toString("base64");
  logger.info(`[Ollama] Image encoded to base64: ${imageBase64.length} chars`);

  const orderedModels = selectedModel
    ? [selectedModel, ...modelCandidates.filter((m) => m !== selectedModel)]
    : [...modelCandidates];

  let raw = null;
  let parsed = null;
  let modelUsed = null;
  let lastError = null;
  for (const model of orderedModels) {
    try {
      logger.info(`[Ollama] Sending request with model ${model}`);
      const result = await requestWithModel(
        model,
        imageBase64,
        imageBuffer.length,
      );
      raw = result.raw;
      parsed = parseModelJson(result.content);
      modelUsed = model;
      selectedModel = model;
      break;
    } catch (error) {
      lastError = error;
      logger.warn(`[Ollama] Model ${model} failed, trying fallback`, {
        error: error?.message,
      });
    }
  }

  if (!modelUsed) {
    logger.error("[Ollama] All model candidates failed", {
      models: orderedModels,
      error: lastError?.message,
    });
    throw (
      lastError || new Error("No working Ollama model candidate available.")
    );
  }

  logger.info("[Ollama] Raw response keys", {
    keys: raw ? Object.keys(raw) : [],
    modelUsed,
  });
  logger.info("[Ollama] Parsed JSON result", parsed);

  const normalized = normalizeModelResult(parsed || {});
  const elapsedMs = Date.now() - startedAt;

  logger.info(`[Ollama] Detection complete`, {
    hasTable: normalized.hasTable,
    confidence: normalized.confidence,
    rows: normalized.rows,
    columns: normalized.columns,
    hasGrid: normalized.hasGrid,
    totalElapsedMs: elapsedMs,
    model: modelUsed,
  });

  return {
    hasTable: normalized.hasTable,
    confidence: Math.round(normalized.confidence * 1000) / 1000,
    boundingBoxes: [],
    elapsedMs,
    model: modelUsed,
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

  for (const image of images) {
    if (image.ocr?.status !== "passed" || !image.sourceUrl) {
      output.push({
        ...image,
        tableDetection: { status: "skipped" },
      });
      continue;
    }

    processed += 1;
    try {
      let result = null;
      let lastError = null;
      for (let attempt = 1; attempt <= ollamaRetryAttempts; attempt += 1) {
        try {
          result = await detectTablesInImage(image.sourceUrl);
          break;
        } catch (error) {
          lastError = error;
          logger.warn(
            `Table detection attempt ${attempt}/${ollamaRetryAttempts} failed for ${image.sourceUrl}`,
            error,
          );
        }
      }
      if (!result) throw lastError || new Error("Table detection failed.");
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
