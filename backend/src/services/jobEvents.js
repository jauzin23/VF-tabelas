import { logger } from "../utils/logger.js";

const clients = new Set();

const writeEvent = (res, event, data) => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};

export const addJobEventClient = (jobId, res) => {
  const client = { jobId, res };
  clients.add(client);
  logger.info("SSE client connected", { jobId, clients: clients.size });

  res.on("close", () => {
    clients.delete(client);
    logger.info("SSE client disconnected", { jobId, clients: clients.size });
  });
};

export const publishJobUpdate = (job) => {
  for (const client of clients) {
    if (client.jobId !== job.id) continue;
    try {
      writeEvent(client.res, "job", job);
    } catch {
      clients.delete(client);
    }
  }
};

export const publishKeepAlive = () => {
  for (const client of clients) {
    try {
      writeEvent(client.res, "ping", { t: Date.now() });
    } catch {
      clients.delete(client);
    }
  }
};
