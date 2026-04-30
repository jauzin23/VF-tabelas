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
    pageUrl: string;
    pageTitle: string;
    imageSrc: string;
    imageAlt: string;
    width: number;
    height: number;
    hasTable: boolean;
    imageFile?: string;
    imageMetadataFile?: string;
    ocr?: {
      status: "passed" | "failed" | "skipped" | "error";
      reason?: "missing_file" | "too_small";
      words?: number;
      confidence?: number;
      text?: string;
    };
  }>;
}
