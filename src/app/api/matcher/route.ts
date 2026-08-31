import { isLoopbackOperatorUrl, operatorUnavailable } from "@/lib/operator-url";

export async function GET() {
  const matcherUrl = process.env.PHLEBAS_MATCHER_URL;
  if (!isLoopbackOperatorUrl(matcherUrl)) {
    return operatorUnavailable("matcher-unavailable", { matcher: "in-browser" });
  }
  const response = await fetch(new URL("/health", matcherUrl));
  return new Response(await response.text(), {
    status: response.status,
    headers: { "content-type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const matcherUrl = process.env.PHLEBAS_MATCHER_URL;
  if (!isLoopbackOperatorUrl(matcherUrl)) {
    return operatorUnavailable("matcher-unavailable", { matcher: "in-browser" });
  }
  if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/json") {
    return Response.json({ ok: false, reason: "content-type-must-be-application-json" }, { status: 415 });
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).length > 64 * 1024) {
    return Response.json({ ok: false, reason: "request-body-too-large" }, { status: 413 });
  }
  const response = await fetch(new URL("/orders", matcherUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  return new Response(await response.text(), {
    status: response.status,
    headers: { "content-type": "application/json", "Cache-Control": "no-store" },
  });
}
