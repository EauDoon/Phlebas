const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export function isLoopbackOperatorUrl(value: string | undefined): value is string {
  if (!value) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:") return false;
  if (url.username || url.password) return false;
  if (url.search !== "" || url.hash !== "") return false;
  if (url.pathname !== "/" && url.pathname !== "") return false;
  return LOOPBACK.has(url.hostname);
}

export function listenHost(requested?: string, env: Record<string, string | undefined> = process.env): string {
  const host = requested ?? env.PHLEBAS_BIND ?? "127.0.0.1";
  if (host === "0.0.0.0" || host === "::") {
    if (env.PHLEBAS_ALLOW_NON_LOOPBACK === "1") return host;
    throw new Error("Direct processes bind loopback only. Compose may set PHLEBAS_ALLOW_NON_LOOPBACK=1.");
  }
  return host;
}

export function operatorUnavailable(reason: "gateway-unavailable" | "matcher-unavailable", extra: Record<string, string> = {}) {
  return Response.json(
    { ok: false, reason, ...extra },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
