import { NextRequest, NextResponse } from "next/server";

const backend = process.env.BACKEND_URL || "http://localhost:4000";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const response = await fetch(`${backend}/api/jobs/${params.id}`, { cache: "no-store" });
    const body = await response.text();
    return new NextResponse(body, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") || "application/json" },
    });
  } catch (error) {
    console.error(`[frontend/api/jobs/${params.id}] Failed to proxy GET`, error);
    return NextResponse.json(
      { error: `Could not reach backend at ${backend}. Check BACKEND_URL/backend container.` },
      { status: 502 },
    );
  }
}
