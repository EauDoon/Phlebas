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
  if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/json") {
    return Response.json({ ok: false, reason: "content-type-must-be-application-json" }, { status: 415 });
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).length > 64 * 1024) {
    return Response.json({ ok: false, reason: "request-body-too-large" }, { status: 413 });
  }
  const response = await fetch(new URL("/orders", MATCHER_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  return new Response(await response.text(), {
    status: response.status,
    headers: { "content-type": "application/json", "Cache-Control": "no-store" },
  });
}
