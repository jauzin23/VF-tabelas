import type { JobData } from "./types";

const base = process.env.NEXT_PUBLIC_API_BASE || "/api/jobs";

const readErrorMessage = async (response: Response, fallback: string): Promise<string> => {
  const text = await response.text();
  if (!text) return fallback;

  try {
    const parsed = JSON.parse(text) as { error?: string };
    return parsed.error || fallback;
  } catch {
    return text;
  }
};

export const createJob = async (url: string): Promise<JobData> => {
  const response = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response, "Failed to create job");
    throw new Error(message);
  }

  return response.json() as Promise<JobData>;
};

export const getJob = async (jobId: string): Promise<JobData> => {
  const response = await fetch(`${base}/${jobId}`, { cache: "no-store" });
  if (!response.ok) {
    const message = await readErrorMessage(response, "Failed to fetch job");
    throw new Error(message);
  }

  return response.json() as Promise<JobData>;
};

export type JobImagesResponse = {
  jobId: string;
  raw: Array<{ name: string; url: string }>;
  passed: Array<{ name: string; url: string }>;
  tabela: Array<{ name: string; url: string }>;
};

export const getJobImages = async (jobId: string): Promise<JobImagesResponse> => {
  const response = await fetch(`${base}/${jobId}/images`, { cache: "no-store" });
  if (!response.ok) {
    const message = await readErrorMessage(response, "Failed to fetch job images");
    throw new Error(message);
  }
  return response.json() as Promise<JobImagesResponse>;
};
