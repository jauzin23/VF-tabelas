import { Router } from "express";
import { createJob, deleteJob, getJob } from "../services/jobManager.js";
import { logger } from "../utils/logger.js";
import { addJobEventClient } from "../services/jobEvents.js";
import { ensureEnvLoaded } from "../utils/env.js";

export const jobsRouter = Router();

ensureEnvLoaded();

// POST /api/jobs
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

// GET /api/jobs/:id/images
jobsRouter.get("/:id/images", async (req, res) => {
  const jobId = req.params.id;
  const job = getJob(jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found." });
    return;
  }

  res.json({
    jobId,
    items: (job.results ?? []).map((item) => ({
      id: item.id,
      sourceUrl: item.sourceUrl,
      foundPageUrls: item.foundPageUrls ?? [],
      foundAt: item.foundAt,
      size: item.size ?? { width: item.width ?? 0, height: item.height ?? 0 },
      ocrStatus: item.ocr?.status ?? "skipped",
      hasTable: Boolean(item.tableDetection?.status === "detected"),
      tableStatus: item.tableDetection?.status ?? "skipped",
    })),
  });
});

// GET /api/jobs/:id/images/:group/:file
jobsRouter.get("/:id/images/:group/:file", (_req, res) => {
  res.status(410).json({
    error:
      "Legacy image file endpoint removed. Use GET /api/jobs/:id/images items[].sourceUrl.",
  });
});

// GET /api/jobs/:id/events  (SSE)
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
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  // Send the current state immediately so the client is never blank.
  res.write(`event: job\n`);
  res.write(`data: ${JSON.stringify(job)}\n\n`);

  addJobEventClient(req.params.id, res);
});

// GET /api/jobs/:id
jobsRouter.get("/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found." });
    return;
  }

  res.json(job);
});

// DELETE /api/jobs/:id
jobsRouter.delete("/:id", (req, res) => {
  const deleted = deleteJob(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "Job not found." });
    return;
  }

  res.status(204).send();
});
