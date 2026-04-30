import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const backend = process.env.BACKEND_URL || "http://localhost:4000";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let backendRes: Response;
  try {
    backendRes = await fetch(`${backend}/api/jobs/${id}/events`, {
      headers: { Accept: "text/event-stream" },
      cache: "no-store",
    });
  } catch (err) {
    console.error(
      `[SSE proxy] Could not connect to backend for job ${id}`,
      err,
    );
    return new Response('data: {"error":"backend unavailable"}\n\n', {
      status: 502,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  if (!backendRes.ok || !backendRes.body) {
    return new Response(
      `data: {"error":"backend returned ${backendRes.status}"}\n\n`,
      {
        status: backendRes.status,
        headers: { "Content-Type": "text/event-stream" },
      },
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader = backendRes.body!.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } catch {
        // client disconnected
      } finally {
        controller.close();
        reader.cancel();
      }
    },
    cancel() {
      backendRes.body?.cancel();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
