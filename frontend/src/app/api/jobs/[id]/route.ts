import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const backend = process.env.BACKEND_URL || "http://localhost:4000";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const response = await fetch(`${backend}/api/jobs/${id}`, {
      cache: "no-store",
    });
    const body = await response.json();
    return NextResponse.json(body, { status: response.status });
  } catch (error) {
    console.error(`[frontend/api/jobs/${id}] Failed to proxy GET`, error);
    return NextResponse.json(
      { error: `Could not reach backend at ${backend}.` },
      { status: 502 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const response = await fetch(`${backend}/api/jobs/${id}`, {
      method: "DELETE",
      cache: "no-store",
    });
    if (response.status === 204) return new Response(null, { status: 204 });
    const body = await response.json();
    return NextResponse.json(body, { status: response.status });
  } catch (error) {
    console.error(`[frontend/api/jobs/${id}] Failed to proxy DELETE`, error);
    return NextResponse.json(
      { error: `Could not reach backend at ${backend}.` },
      { status: 502 },
    );
  }
}
