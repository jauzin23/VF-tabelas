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

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const defaults = {
  maxPages: toInt(process.env.MAX_PAGES, 20),
  maxDepth: toInt(process.env.MAX_DEPTH, 2),
  pageTimeoutMs: toInt(process.env.PAGE_TIMEOUT_MS, 10000),
};

const dataPath = resolveDataPath(process.env.DATA_PATH);

const moveFileSafe = async (sourcePath, destinationPath) => {
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });

  try {
    await fs.rename(sourcePath, destinationPath);
  } catch (error) {
    const code = error instanceof Error ? error.code : undefined;
    if (code !== "EXDEV") throw error;

    await fs.copyFile(sourcePath, destinationPath);
    await fs.unlink(sourcePath);
  }

  return destinationPath;
};

const movePassedOcrAssets = async (jobId, images) => {
  const passedImagesDir = path.join(
    dataPath,
    "jobs",
    jobId,
    "images",
    "passed",
  );

  return Promise.all(
    images.map(async (image) => {
      if (image.ocr?.status !== "passed" || !image.imageFile) {
        return image;
      }

      const nextImageFile = await moveFileSafe(
        image.imageFile,
        path.join(passedImagesDir, path.basename(image.imageFile)),
      );
      const nextMetadataFile = image.imageMetadataFile
        ? await moveFileSafe(
            image.imageMetadataFile,
            path.join(passedImagesDir, path.basename(image.imageMetadataFile)),
          )
        : undefined;

      return {
        ...image,
        imageFile: nextImageFile,
        imageMetadataFile: nextMetadataFile,
      };
    }),
  );
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
  publishJobUpdate(job);
  runJob(job).catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Job ${job.id} failed`, error);
    job.status = "failed";
    job.error = message;
    job.finishedAt = new Date().toISOString();
    publishJobUpdate(job);
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
  publishJobUpdate(job);

  job.results = await crawlSite(job.targetUrl, job.options, {
    onPagesDiscovered: (count) => {
      job.progress.pagesDiscovered = count;
      publishJobUpdate(job);
    },
    onPageProcessed: () => {
      job.progress.pagesProcessed += 1;
      publishJobUpdate(job);
    },
    onImagesFound: (count) => {
      job.progress.imagesFound = count;
      publishJobUpdate(job);
    },
  });
  job.results = await downloadImagesForJob(job.id, job.results, dataPath);
  job.progress.imagesDownloaded = job.results.filter((img) =>
    Boolean(img.imageFile),
  ).length;
  publishJobUpdate(job);
  job.results = await ocrFilterImages(job.results, (processed, passed) => {
    job.progress.imagesOcrProcessed = processed;
    job.progress.imagesPassedOcr = passed;
    publishJobUpdate(job);
  });
  job.results = await movePassedOcrAssets(job.id, job.results);
  publishJobUpdate(job);

  job.results = await detectTablesForJob(job.id, job.results, (processed, detected) => {
    job.progress.imagesTableProcessed = processed;
    job.progress.tablesDetected = detected;
    publishJobUpdate(job);
  });
  publishJobUpdate(job);

  job.status = "completed";
  job.finishedAt = new Date().toISOString();
  logger.info(`Job ${job.id} completed`, {
    pagesDiscovered: job.progress.pagesDiscovered,
    pagesProcessed: job.progress.pagesProcessed,
    imagesFound: job.progress.imagesFound,
  });
  publishJobUpdate(job);
};

export const getJob = (id) => jobs.get(id);

export const deleteJob = (id) => jobs.delete(id);
