const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const OPERATOR_TIMEOUT_MS = 3_000;
const OPERATOR_RESPONSE_BYTES = 128 * 1024;

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

export function operatorUnavailable(reason: "matcher-unavailable", extra: Record<string, string> = {}) {
  return Response.json(
    { ok: false, reason, ...extra },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export async function fetchLoopbackOperator(
  input: URL,
  init: RequestInit = {},
  fetcher: typeof fetch = fetch,
  maximumBodyBytes = OPERATOR_RESPONSE_BYTES,
): Promise<Readonly<{ body: string; status: number }> | undefined> {
  try {
    const response = await fetcher(input, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(OPERATOR_TIMEOUT_MS),
    });
    const declaredLength = response.headers.get("content-length");
    if (declaredLength && (!/^(?:0|[1-9][0-9]*)$/.test(declaredLength)
      || BigInt(declaredLength) > BigInt(maximumBodyBytes))) {
      await response.body?.cancel();
      return undefined;
    }
    if (!response.body) return Object.freeze({ body: "", status: response.status });
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumBodyBytes) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return Object.freeze({ body: new TextDecoder().decode(bytes), status: response.status });
  } catch {
    return undefined;
  }
}
