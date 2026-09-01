import { fetchLoopbackOperator, isLoopbackOperatorUrl, operatorUnavailable } from "@/lib/operator-url";

export async function GET() {
  const matcherUrl = process.env.PHLEBAS_MATCHER_URL;
  if (!isLoopbackOperatorUrl(matcherUrl)) {
    return operatorUnavailable("matcher-unavailable", { matcher: "in-browser" });
  }
  const response = await fetchLoopbackOperator(new URL("/health", matcherUrl));
  if (!response) return operatorUnavailable("matcher-unavailable", { matcher: "in-browser" });
  return new Response(response.body, {
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
  const response = await fetchLoopbackOperator(new URL("/orders", matcherUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  if (!response) return operatorUnavailable("matcher-unavailable", { matcher: "in-browser" });
  return new Response(response.body, {
    status: response.status,
    headers: { "content-type": "application/json", "Cache-Control": "no-store" },
  });
}
