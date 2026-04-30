import path from "node:path";
import { createWorker } from "tesseract.js";
import { logger } from "../utils/logger.js";
import { ensureEnvLoaded, resolveDataPath } from "../utils/env.js";

ensureEnvLoaded();

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toFloat = (value, fallback) => {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
};

const ocrLanguage = process.env.OCR_LANGUAGE || "eng+por";
const ocrMinWords = toInt(process.env.OCR_MIN_WORDS, 2);
const ocrMinConfidence = toFloat(process.env.OCR_MIN_CONFIDENCE, 40);
const ocrMinAlphaRatio = toFloat(process.env.OCR_MIN_ALPHA_RATIO, 0);
const ocrMinMeanWordLength = toFloat(process.env.OCR_MIN_MEAN_WORD_LENGTH, 0);
const ocrMinWordLikeRatio = toFloat(process.env.OCR_MIN_WORDLIKE_RATIO, 0);
const ocrMaxChars = toInt(process.env.OCR_MAX_CHARS, 600);
const minImageWidth = toInt(process.env.MIN_IMAGE_WIDTH, 120);
const minImageHeight = toInt(process.env.MIN_IMAGE_HEIGHT, 80);
const minImageArea = toInt(process.env.MIN_IMAGE_AREA, 120 * 80);
const ocrDebug = process.env.OCR_DEBUG === "1";

const dataPath = resolveDataPath(process.env.DATA_PATH);
const cachePath =
  process.env.OCR_CACHE_PATH || path.join(dataPath, "tesseract-cache");

/** @type {Promise<import('tesseract.js').Worker> | null} */
let workerPromise = null;

const getWorker = () => {
  if (!workerPromise) {
    workerPromise = (async () => {
      logger.info("Initializing OCR worker", {
        ocrLanguage,
        cachePath,
        ocrMinWords,
        ocrMinConfidence,
      });
      const worker = await createWorker(ocrLanguage, undefined, {
        cachePath,
        logger: (m) => {
          if (!ocrDebug) return;
          if (m?.status === "recognizing text") return;
          logger.info("OCR", m);
        },
      });
      // tesseract.js API varies slightly across versions; reinitialize is consistently available.
      await worker.reinitialize?.(ocrLanguage);
      return worker;
    })();
  }
  return workerPromise;
};

const summarizeText = (text) => {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= ocrMaxChars) return cleaned;
  return `${cleaned.slice(0, ocrMaxChars)}…`;
};

const computeStats = (result) => {
  const text =
    typeof result?.data?.text === "string" ? result.data.text : "";
  const wordsArr = Array.isArray(result?.data?.words)
    ? result.data.words
    : [];
  const cleanedText = text.replace(/\s+/g, " ").trim();
  const tokensFromWords = wordsArr
    .map((w) => (w.text || "").trim())
    .filter((t) => t.length > 0);
  const tokensFromText =
    tokensFromWords.length > 0
      ? []
      : cleanedText
          .split(" ")
          .map((t) => t.trim())
          .filter((t) => t.length > 1); // avoid counting punctuation/noise as words

  const confidences = wordsArr
    .map((w) => (typeof w.confidence === "number" ? w.confidence : NaN))
    .filter((c) => Number.isFinite(c));

  const avgWordConf = confidences.length
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : NaN;
  const overallConf =
    typeof result?.data?.confidence === "number" ? result.data.confidence : NaN;
  const confidence = Number.isFinite(avgWordConf)
    ? avgWordConf
    : Number.isFinite(overallConf)
      ? overallConf
      : 0;
  const words =
    tokensFromWords.length > 0 ? tokensFromWords.length : tokensFromText.length;

  const alphaChars = (cleanedText.match(/\p{L}/gu) ?? []).length;
  const nonWhitespaceChars = cleanedText.replace(/\s+/g, "").length;
  const alphaRatio =
    nonWhitespaceChars > 0 ? alphaChars / nonWhitespaceChars : 0;

  const letterTokens = cleanedText
    .split(" ")
    .map((token) => token.replace(/[^\p{L}\p{M}]/gu, ""))
    .filter((token) => token.length > 0);
  const meanWordLength = letterTokens.length
    ? letterTokens.reduce((sum, token) => sum + token.length, 0) /
      letterTokens.length
    : 0;
  const wordLikeTokens = letterTokens.filter((token) => token.length >= 3);
  const wordLikeRatio =
    letterTokens.length > 0 ? wordLikeTokens.length / letterTokens.length : 0;

  return {
    words,
    confidence,
    text: summarizeText(text),
    alphaRatio,
    meanWordLength,
    wordLikeRatio,
  };
};

export const ocrFilterImages = async (images, onProgress) => {
  const worker = await getWorker();
  const output = [];
  let processed = 0;
  let passed = 0;

  for (const image of images) {
    processed += 1;
    if (!image.imageFile) {
      output.push({
        ...image,
        ocr: { status: "skipped", reason: "missing_file" },
      });
      onProgress?.(processed, passed);
      continue;
    }
    if (
      image.width > 0 &&
      image.height > 0 &&
      (image.width < minImageWidth ||
        image.height < minImageHeight ||
        image.width * image.height < minImageArea)
    ) {
      output.push({
        ...image,
        ocr: { status: "skipped", reason: "too_small" },
      });
      onProgress?.(processed, passed);
      continue;
    }

    try {
      const result = await worker.recognize(image.imageFile);
      const stats = computeStats(result);
      const ok =
        stats.words >= ocrMinWords &&
        stats.confidence >= ocrMinConfidence &&
        stats.alphaRatio >= ocrMinAlphaRatio &&
        stats.meanWordLength >= ocrMinMeanWordLength &&
        stats.wordLikeRatio >= ocrMinWordLikeRatio;
      if (ok) passed += 1;

      output.push({
        ...image,
        ocr: {
          status: ok ? "passed" : "failed",
          words: stats.words,
          confidence: stats.confidence,
          text: stats.text,
        },
      });
    } catch (error) {
      logger.warn(`OCR failed for ${image.imageFile}`, error);
      output.push({ ...image, ocr: { status: "error" } });
    }

    onProgress?.(processed, passed);
  }

  logger.info("OCR filtering completed", {
    processed,
    passed,
    ocrLanguage,
    ocrMinWords,
    ocrMinConfidence,
    ocrMinAlphaRatio,
    ocrMinMeanWordLength,
    ocrMinWordLikeRatio,
  });
  return output;
};
