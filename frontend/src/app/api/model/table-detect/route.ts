import { NextRequest, NextResponse } from "next/server";

const backend = process.env.BACKEND_URL || "http://localhost:4000";

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "application/octet-stream";
    const buffer = await request.arrayBuffer();

    const response = await fetch(`${backend}/api/model/table-detect`, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: buffer,
      cache: "no-store",
    });

    const body = await response.text();
    return new NextResponse(body, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") || "application/json" },
    });
  } catch (error) {
    console.error("[frontend/api/model/table-detect] Failed to proxy POST", error);
    return NextResponse.json(
      { error: `Could not reach backend at ${backend}. Check BACKEND_URL/backend container.` },
      { status: 502 },
    );
  }
}

