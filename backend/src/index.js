import express from "express";
import cors from "cors";
import multer from "multer";
import { jobsRouter } from "./routes/jobs.js";
import { modelRouter } from "./routes/model.js";
import { logger } from "./utils/logger.js";
import { publishKeepAlive } from "./services/jobEvents.js";
import { ensureEnvLoaded } from "./utils/env.js";

ensureEnvLoaded();

const app = express();
const port = Number.parseInt(process.env.BACKEND_PORT ?? "4000", 10);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Configure multer for image upload (memory storage, no disk writes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

app.use("/api/model", upload.single("file"));
app.use((req, _res, next) => {
  // Avoid spamming logs for polling/SSE traffic.
  const isJobGet =
    req.method === "GET" && /^\/api\/jobs\/[^/]+$/.test(req.originalUrl);
  const isSse =
    req.method === "GET" &&
    /^\/api\/jobs\/[^/]+\/events$/.test(req.originalUrl);
  if (!isJobGet && !isSse) {
    logger.info(`Incoming request ${req.method} ${req.originalUrl}`);
  }
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/jobs", jobsRouter);
app.use("/api/model", modelRouter);
app.use((error, req, res, _next) => {
  logger.error(`Unhandled error on ${req.method} ${req.originalUrl}`, error);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(port, () => {
  logger.info(`Backend running on port ${port}`);
});

setInterval(() => publishKeepAlive(), 25_000).unref();
