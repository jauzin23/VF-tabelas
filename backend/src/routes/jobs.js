import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { createJob, deleteJob, getJob } from "../services/jobManager.js";
import { logger } from "../utils/logger.js";
import { addJobEventClient } from "../services/jobEvents.js";
import { ensureEnvLoaded, resolveDataPath } from "../utils/env.js";

export const jobsRouter = Router();

ensureEnvLoaded();
const dataPath = resolveDataPath(process.env.DATA_PATH);

const listImagesInDir = async (dirAbsolute) => {
  try {
    const entries = await fs.readdir(dirAbsolute, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .filter((name) => name.startsWith("img_"))
      .filter((name) => !name.toLowerCase().endsWith(".json"))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
};

const jobImagesDir = (jobId, group) =>
  path.join(dataPath, "jobs", jobId, "images", group);

const isSafeFileName = (name) => {
  return /^img_[a-z0-9-]+\.[a-z0-9]{1,5}$/i.test(name);
};

jobsRouter.post("/", (req, res) => {
  try {
    const body = req.body;
    if (!body.url) {
      res.status(400).json({ error: "Field 'url' is required." });
      return;
    }

    let parsed;
    try {
      parsed = new URL(body.url);
    } catch {
      res.status(400).json({ error: "URL is invalid." });
      return;
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      res
        .status(400)
        .json({ error: "Only http and https URLs are supported." });
      return;
    }

    const job = createJob({
      url: parsed.toString(),
      options: body.options,
    });
    logger.info(`Created job ${job.id} for ${job.targetUrl}`);

    res.status(201).json(job);
  } catch (error) {
    logger.error("Failed to create job", error);
    res.status(500).json({ error: "Failed to create job." });
  }
});

jobsRouter.get("/:id/images", async (req, res) => {
  const jobId = req.params.id;
  const job = getJob(jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found." });
    return;
  }

  const rawDir = jobImagesDir(jobId, "raw");
  const passedDir = jobImagesDir(jobId, "passed");
  const tabelaDir = jobImagesDir(jobId, "tabela");
  const [raw, passed, tabela] = await Promise.all([
    listImagesInDir(rawDir),
    listImagesInDir(passedDir),
    listImagesInDir(tabelaDir),
  ]);

  res.json({
    jobId,
    raw: raw.map((name) => ({
      name,
      url: `/api/jobs/${jobId}/images/raw/${encodeURIComponent(name)}`,
    })),
    passed: passed.map((name) => ({
      name,
      url: `/api/jobs/${jobId}/images/passed/${encodeURIComponent(name)}`,
    })),
    tabela: tabela.map((name) => ({
      name,
      url: `/api/jobs/${jobId}/images/tabela/${encodeURIComponent(name)}`,
    })),
  });
});

jobsRouter.get("/:id/images/:group/:file", async (req, res) => {
  const jobId = req.params.id;
  const job = getJob(jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found." });
    return;
  }

  const group = String(req.params.group);
  if (!["raw", "passed", "tabela"].includes(group)) {
    res
      .status(400)
      .json({ error: "Invalid group. Use 'raw', 'passed' or 'tabela'." });
    return;
  }

  const file = String(req.params.file);
  if (!isSafeFileName(file)) {
    res.status(400).json({ error: "Invalid file name." });
    return;
  }

  const absolute = path.join(jobImagesDir(jobId, group), file);
  try {
    await fs.access(absolute);
  } catch {
    res.status(404).json({ error: "Image not found." });
    return;
  }

  res.sendFile(absolute);
});

jobsRouter.get("/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found." });
    return;
  }

  res.json(job);
});

jobsRouter.get("/:id/events", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found." });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  res.write(`event: job\n`);
  res.write(`data: ${JSON.stringify(job)}\n\n`);

  addJobEventClient(req.params.id, res);
});

jobsRouter.delete("/:id", (req, res) => {
  const deleted = deleteJob(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "Job not found." });
    return;
  }

  res.status(204).send();
});
