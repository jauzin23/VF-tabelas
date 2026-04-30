import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

let loaded = false;

const getRoots = () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const backendRoot = path.resolve(__dirname, "..", "..");
  const workspaceRoot = path.resolve(backendRoot, "..");
  return { backendRoot, workspaceRoot };
};

export const ensureEnvLoaded = () => {
  if (loaded) return;

  const { backendRoot, workspaceRoot } = getRoots();
  const envCandidates = [
    path.join(process.cwd(), ".env"),
    path.join(backendRoot, ".env"),
    path.join(workspaceRoot, ".env"),
    path.join(process.cwd(), ".env.example"),
    path.join(backendRoot, ".env.example"),
    path.join(workspaceRoot, ".env.example"),
  ];

  for (const envPath of envCandidates) {
    if (!fs.existsSync(envPath)) continue;
    dotenv.config({ path: envPath });
    break;
  }

  loaded = true;
};

export const resolveDataPath = (rawDataPath) => {
  const { workspaceRoot } = getRoots();
  const defaultDataPath = path.resolve(workspaceRoot, "data");
  if (!rawDataPath || rawDataPath.trim().length === 0) return defaultDataPath;

  // In local Windows runs, POSIX-style /data should map to workspace/data.
  if (process.platform === "win32" && /^\/(?!\/)/.test(rawDataPath)) {
    return path.resolve(workspaceRoot, rawDataPath.slice(1));
  }

  // Handle relative paths like ./data or ../data
  if (!path.isAbsolute(rawDataPath)) {
    return path.resolve(workspaceRoot, rawDataPath);
  }

  return rawDataPath;
};
