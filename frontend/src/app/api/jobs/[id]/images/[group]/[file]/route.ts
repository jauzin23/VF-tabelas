export const dynamic = "force-dynamic";
export async function GET() {
  return new Response(
    JSON.stringify({
      error:
        "Legacy image file endpoint removed. Use GET /api/jobs/:id/images items[].sourceUrl.",
    }),
    {
      status: 410,
      headers: { "Content-Type": "application/json" },
    },
  );
}
