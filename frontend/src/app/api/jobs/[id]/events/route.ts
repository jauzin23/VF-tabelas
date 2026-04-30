import { NextRequest } from "next/server";

const backend = process.env.BACKEND_URL || "http://localhost:4000";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const response = await fetch(`${backend}/api/jobs/${params.id}/events`, {
    headers: { Accept: "text/event-stream" },
    cache: "no-store",
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

