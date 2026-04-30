import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const backend = process.env.BACKEND_URL || "http://localhost:4000";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const response = await fetch(`${backend}/api/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const body = await response.json();
    return NextResponse.json(body, { status: response.status });
  } catch (error) {
    console.error("[frontend/api/jobs] Failed to proxy POST /api/jobs", error);
    return NextResponse.json(
      {
        error: `Could not reach backend at ${backend}. Check BACKEND_URL/backend container.`,
      },
      { status: 502 },
    );
  }
}
