const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const OPERATOR_TIMEOUT_MS = 3_000;

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
  if (env.PHLEBAS_ALLOW_NON_LOOPBACK === "1") return host;
  if (!LOOPBACK.has(host)) {
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

export async function fetchLoopbackOperator(
  input: URL,
  init: RequestInit = {},
  fetcher: typeof fetch = fetch,
): Promise<Readonly<{ body: string; status: number }> | undefined> {
  try {
    const response = await fetcher(input, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(OPERATOR_TIMEOUT_MS),
    });
    return Object.freeze({ body: await response.text(), status: response.status });
  } catch {
    return undefined;
  }
}
