import type { JobData } from "./types";

const base = process.env.NEXT_PUBLIC_API_BASE || "/api/jobs";

/**
 * Subscribe to SSE events for a job.
 * Returns an unsubscribe function.
 */
export function subscribeToJob(
  jobId: string,
  onUpdate: (job: JobData) => void,
  onError?: (error: Error) => void,
): () => void {
  const eventSource = new EventSource(`${base}/${jobId}/events`);

  const handleMessage = (event: MessageEvent) => {
    try {
      const job = JSON.parse(event.data) as JobData;
      onUpdate(job);
    } catch (error) {
      onError?.(
        new Error(
          `Failed to parse SSE message: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  };

  const handleError = () => {
    eventSource.close();
    onError?.(new Error("SSE connection lost"));
  };

  eventSource.addEventListener("job", handleMessage);
  eventSource.addEventListener("error", handleError);

  // Return unsubscribe function
  return () => {
    eventSource.removeEventListener("job", handleMessage);
    eventSource.removeEventListener("error", handleError);
    eventSource.close();
  };
}
