const GATEWAY_URL = process.env.PHLEBAS_GATEWAY_URL;

export async function POST() {
  if (!GATEWAY_URL) {
    return Response.json(
      { ok: false, reason: "gateway-unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const response = await fetch(new URL("/intents", GATEWAY_URL), { method: "POST" });
  const body = await response.text();
  return new Response(body, {
    status: response.status,
    headers: { "content-type": "application/json", "Cache-Control": "no-store" },
  });
}
