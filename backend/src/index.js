import express from "express";
import cors from "cors";
import { jobsRouter } from "./routes/jobs.js";
import { modelRouter } from "./routes/model.js";
import { logger } from "./utils/logger.js";
import { publishKeepAlive } from "./services/jobEvents.js";
import { ensureEnvLoaded } from "./utils/env.js";

ensureEnvLoaded();

const app = express();
const port = Number.parseInt(process.env.BACKEND_PORT ?? "4000", 10);

app.use(cors());
// JSON for normal API requests.
app.use(express.json({ limit: "1mb" }));

// Raw image uploads for model testing.
app.use(
  "/api/model",
  express.raw({
    type: ["image/*", "application/octet-stream"],
    limit: "15mb",
  }),
);
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
