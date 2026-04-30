import { NextRequest } from "next/server";

const backend = process.env.BACKEND_URL || "http://localhost:4000";

export async function GET(_request: NextRequest, { params }: { params: { id: string; group: string; file: string } }) {
  const url = `${backend}/api/jobs/${params.id}/images/${params.group}/${encodeURIComponent(params.file)}`;
  const response = await fetch(url, { cache: "no-store" });
  return new Response(response.body, {
    status: response.status,
    headers: {
      // Let browser infer if backend didn't send it; but we forward when present.
      "Content-Type": response.headers.get("content-type") || "application/octet-stream",
      "Cache-Control": "no-store",
    },
  });
}

