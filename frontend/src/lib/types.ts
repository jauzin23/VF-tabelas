export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface JobData {
  id: string;
  targetUrl: string;
  status: JobStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  error?: string;
  progress: {
    pagesDiscovered: number;
    pagesProcessed: number;
    imagesFound: number;
    imagesDownloaded: number;
    imagesOcrProcessed: number;
    imagesPassedOcr: number;
    imagesTableProcessed?: number;
    tablesDetected?: number;
  };
  results: Array<{
    id: string;
    sourceUrl: string;
    foundPageUrls: string[];
    foundAt: string;
    sourceUrlId?: string;
    imageAlt: string;
    width: number;
    height: number;
    size?: {
      width: number;
      height: number;
      bytes?: number;
    };
    hasTable: boolean;
    fetch?: {
      status: "ok" | "error";
      statusCode?: number;
      contentType?: string | null;
      finalUrl?: string;
    };
    ocr?: {
      status: "passed" | "failed" | "skipped" | "error";
      reason?:
        | "missing_source"
        | "too_small"
        | "fetch_failed"
        | "alt_filtered"
        | "too_small_rendered"
        | "too_small_actual";
      words?: number;
      confidence?: number;
      text?: string;
    };
    tableDetection?: {
      status: "detected" | "none" | "skipped" | "error";
      confidence?: number;
      boundingBoxes?: unknown[];
    };
  }>;
}
