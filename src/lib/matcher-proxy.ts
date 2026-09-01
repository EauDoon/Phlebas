import { fetchLoopbackOperator, isLoopbackOperatorUrl, operatorUnavailable } from "./operator-url.ts";

const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function matcherUrl(env: Record<string, string | undefined>): string | null {
  const value = env.PHLEBAS_MATCHER_URL;
  return isLoopbackOperatorUrl(value) ? value : null;
}

export async function matcherHealthProxy(env: Record<string, string | undefined> = process.env) {
  const baseUrl = matcherUrl(env);
  if (!baseUrl) return operatorUnavailable("matcher-unavailable", { matcher: "in-browser" });
  const response = await fetchLoopbackOperator(new URL("/health", baseUrl));
  if (!response) return operatorUnavailable("matcher-unavailable", { matcher: "in-browser" });
  return new Response(response.body, {
    status: response.status,
    headers: { "content-type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function matcherOrderProxy(
  request: Request,
  env: Record<string, string | undefined> = process.env,
) {
  const baseUrl = matcherUrl(env);
  if (!baseUrl) return operatorUnavailable("matcher-unavailable", { matcher: "in-browser" });
  if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/json") {
    return Response.json({ ok: false, reason: "content-type-must-be-application-json" }, { status: 415 });
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).length > 64 * 1024) {
    return Response.json({ ok: false, reason: "request-body-too-large" }, { status: 413 });
  }
  const requestId = request.headers.get("idempotency-key");
  if (!requestId || !REQUEST_ID.test(requestId)) {
    return Response.json({ ok: false, reason: "idempotency-key-invalid" }, { status: 400 });
  }
  const response = await fetchLoopbackOperator(new URL("/v1/orders", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": requestId },
    body,
  });
  if (!response) return operatorUnavailable("matcher-unavailable", { matcher: "in-browser" });
  return new Response(response.body, {
    status: response.status,
    headers: { "content-type": "application/json", "Cache-Control": "no-store" },
  });
}
