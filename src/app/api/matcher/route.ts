const MATCHER_URL = process.env.PHLEBAS_MATCHER_URL;

export async function GET() {
  if (!MATCHER_URL) {
    return Response.json(
      { ok: false, reason: "matcher-unavailable", matcher: "in-browser" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  const response = await fetch(new URL("/health", MATCHER_URL));
  return new Response(await response.text(), {
    status: response.status,
    headers: { "content-type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (!MATCHER_URL) {
    return Response.json(
      { ok: false, reason: "matcher-unavailable", matcher: "in-browser" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  const response = await fetch(new URL("/orders", MATCHER_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: await request.text(),
  });
  return new Response(await response.text(), {
    status: response.status,
    headers: { "content-type": "application/json", "Cache-Control": "no-store" },
  });
}
