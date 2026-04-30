import { v4 as uuid } from "uuid";
import fs from "node:fs/promises";
import path from "node:path";
import { crawlSite } from "./crawler.js";
import { downloadImagesForJob } from "./imageDownloader.js";
import { ocrFilterImages } from "./ocrFilter.js";
import { detectTablesForJob } from "./tableDetector.js";
import { logger } from "../utils/logger.js";
import { publishJobUpdate } from "./jobEvents.js";
import { ensureEnvLoaded, resolveDataPath } from "../utils/env.js";

const jobs = new Map();

ensureEnvLoaded();
const dataPath = resolveDataPath(process.env.DATA_PATH);

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const defaults = {
  maxPages: toInt(process.env.MAX_PAGES, 20),
  maxDepth: toInt(process.env.MAX_DEPTH, 2),
  pageTimeoutMs: toInt(process.env.PAGE_TIMEOUT_MS, 10000),
};

const dedupeBySourceUrl = (images) => {
  const map = new Map();

  for (const image of images) {
    const key = image.imageSrc;
    const foundAt = image.foundAt || new Date().toISOString();
    if (!map.has(key)) {
      map.set(key, {
        id: `${map.size + 1}`,
        sourceUrl: image.imageSrc,
        sourceUrlId: image.imageSrc,
        foundPageUrls: [image.pageUrl],
        foundAt,
        size: {
          width: image.width || 0,
          height: image.height || 0,
        },
        imageAlt: image.imageAlt || "",
        hasTable: false,
      });
      continue;
    }

    const existing = map.get(key);
    if (!existing.foundPageUrls.includes(image.pageUrl)) {
      existing.foundPageUrls.push(image.pageUrl);
    }
    if (!existing.size.width && image.width) existing.size.width = image.width;
    if (!existing.size.height && image.height) existing.size.height = image.height;
    if (!existing.imageAlt && image.imageAlt) existing.imageAlt = image.imageAlt;
    if (foundAt < existing.foundAt) existing.foundAt = foundAt;
  }

  return Array.from(map.values()).map((item, index) => ({
    ...item,
    id: `${index + 1}`,
  }));
};

const getJobDir = (jobId) => path.join(dataPath, "jobs", jobId);
const getJobJsonPath = (jobId) => path.join(getJobDir(jobId), "job.json");

const compactResultItem = (item) => ({
  id: item.id,
  sourceUrl: item.sourceUrl,
  foundPageUrls: item.foundPageUrls ?? [],
  size: item.size ?? { width: item.width ?? 0, height: item.height ?? 0 },
  hasTable: Boolean(item.tableDetection?.status === "detected" || item.hasTable),
  ocrStatus: item.ocr?.status ?? "skipped",
  tableStatus: item.tableDetection?.status ?? "skipped",
});

const persistJobSnapshot = async (job) => {
  const snapshot = {
    id: job.id,
    targetUrl: job.targetUrl,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error,
    options: job.options,
    progress: job.progress,
    results: (job.results ?? []).map(compactResultItem),
    updatedAt: new Date().toISOString(),
  };
  await fs.mkdir(getJobDir(job.id), { recursive: true });
  await fs.writeFile(
    getJobJsonPath(job.id),
    JSON.stringify(snapshot, null, 2),
    "utf8",
  );
};

const publishAndPersist = async (job) => {
  publishJobUpdate(job);
  await persistJobSnapshot(job);
};

export const createJob = (payload) => {
  const id = uuid();
  const job = {
    id,
    targetUrl: payload.url,
    status: "queued",
    createdAt: new Date().toISOString(),
    options: {
      maxPages: payload.options?.maxPages ?? defaults.maxPages,
      maxDepth: payload.options?.maxDepth ?? defaults.maxDepth,
      pageTimeoutMs: payload.options?.pageTimeoutMs ?? defaults.pageTimeoutMs,
    },
    progress: {
      pagesDiscovered: 0,
      pagesProcessed: 0,
      imagesFound: 0,
      imagesDownloaded: 0,
      imagesOcrProcessed: 0,
      imagesPassedOcr: 0,
      imagesTableProcessed: 0,
      tablesDetected: 0,
    },
    results: [],
  };

  jobs.set(id, job);
  publishAndPersist(job).catch((error) => {
    logger.warn(`Failed to persist newly created job ${job.id}`, error);
  });
  runJob(job).catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Job ${job.id} failed`, error);
    job.status = "failed";
    job.error = message;
    job.finishedAt = new Date().toISOString();
    publishAndPersist(job).catch((persistError) => {
      logger.warn(`Failed to persist failed job ${job.id}`, persistError);
    });
  });

  return job;
};

const runJob = async (job) => {
  job.status = "running";
  job.startedAt = new Date().toISOString();
  logger.info(`Job ${job.id} started`, {
    targetUrl: job.targetUrl,
    options: job.options,
  });
  await publishAndPersist(job);

  const crawled = await crawlSite(job.targetUrl, job.options, {
    onPagesDiscovered: (count) => {
      job.progress.pagesDiscovered = count;
      publishAndPersist(job).catch((error) => {
        logger.warn(`Failed to persist pagesDiscovered for ${job.id}`, error);
      });
    },
    onPageProcessed: () => {
      job.progress.pagesProcessed += 1;
      publishAndPersist(job).catch((error) => {
        logger.warn(`Failed to persist pageProcessed for ${job.id}`, error);
      });
    },
    onImagesFound: (count) => {
      job.progress.imagesFound = count;
      publishAndPersist(job).catch((error) => {
        logger.warn(`Failed to persist imagesFound for ${job.id}`, error);
      });
    },
  });
  job.results = dedupeBySourceUrl(crawled);
  job.progress.imagesFound = job.results.length;
  await publishAndPersist(job);

  job.results = await downloadImagesForJob(job.id, job.results);
  job.progress.imagesDownloaded = job.results.filter(
    (img) => img.fetch?.status === "ok",
  ).length;
  await publishAndPersist(job);

  job.results = await ocrFilterImages(job.results, (processed, passed) => {
    job.progress.imagesOcrProcessed = processed;
    job.progress.imagesPassedOcr = passed;
    publishAndPersist(job).catch((error) => {
      logger.warn(`Failed to persist OCR progress for ${job.id}`, error);
    });
  });
  await publishAndPersist(job);

  job.results = await detectTablesForJob(
    job.id,
    job.results,
    (processed, detected) => {
      job.progress.imagesTableProcessed = processed;
      job.progress.tablesDetected = detected;
      publishAndPersist(job).catch((error) => {
        logger.warn(`Failed to persist table progress for ${job.id}`, error);
      });
    },
  );
  await publishAndPersist(job);

  job.status = "completed";
  job.finishedAt = new Date().toISOString();
  logger.info(`Job ${job.id} completed`, {
    pagesDiscovered: job.progress.pagesDiscovered,
    pagesProcessed: job.progress.pagesProcessed,
    imagesFound: job.progress.imagesFound,
  });
  await publishAndPersist(job);
};

export const getJob = (id) => jobs.get(id);

export const deleteJob = (id) => jobs.delete(id);
