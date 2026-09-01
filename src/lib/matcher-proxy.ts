import { fetchLoopbackOperator, isLoopbackOperatorUrl, operatorUnavailable } from "./operator-url.ts";

const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HEX32 = /^0x[0-9a-f]{64}$/;
const DECIMAL = /^(?:0|[1-9][0-9]*)$/;
const ORDER_RESPONSE_STATUSES = new Set([400, 401, 409, 413, 415, 422, 429, 503]);
const ORDER_RECEIPT_STATUSES = new Set([
  "open",
  "filled",
  "partially-filled",
  "ioc-remainder-cancelled",
  "fok-rejected",
  "unfilled",
]);

type JsonRecord = Record<string, unknown>;

function matcherUrl(env: Record<string, string | undefined>): string | null {
  const value = env.PHLEBAS_MATCHER_URL;
  return isLoopbackOperatorUrl(value) ? value : null;
}

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function parsedRecord(body: string): JsonRecord | null {
  try {
    return record(JSON.parse(body));
  } catch {
    return null;
  }
}

function safeAsset(value: unknown): JsonRecord | null {
  const asset = record(value);
  if (!asset
    || typeof asset.network !== "string" || asset.network.length > 96
    || typeof asset.asset !== "string" || asset.asset.length > 256
    || (asset.environment !== "testnet" && asset.environment !== "mainnet")
    || typeof asset.decimals !== "number" || !Number.isSafeInteger(asset.decimals)
    || asset.decimals < 0 || asset.decimals > 255) {
    return null;
  }
  return {
    network: asset.network,
    asset: asset.asset,
    environment: asset.environment,
    decimals: asset.decimals,
  };
}

function safeMarket(value: unknown): JsonRecord | null {
  const market = record(value);
  if (!market) return null;
  const base = safeAsset(market.base);
  const quote = safeAsset(market.quote);
  return base && quote ? { base, quote } : null;
}

function safeCheckpoint(value: unknown): JsonRecord | null {
  const checkpoint = record(value);
  if (!checkpoint
    || checkpoint.version !== 1
    || typeof checkpoint.sequence !== "string" || !DECIMAL.test(checkpoint.sequence)
    || typeof checkpoint.recordHash !== "string" || !HEX32.test(checkpoint.recordHash)
    || typeof checkpoint.stateRoot !== "string" || !HEX32.test(checkpoint.stateRoot)
    || typeof checkpoint.configurationHash !== "string" || !HEX32.test(checkpoint.configurationHash)) {
    return null;
  }
  return {
    version: 1,
    sequence: checkpoint.sequence,
    recordHash: checkpoint.recordHash,
    stateRoot: checkpoint.stateRoot,
    configurationHash: checkpoint.configurationHash,
  };
}

function unavailable() {
  return operatorUnavailable("matcher-unavailable", { matcher: "in-browser" });
}

function noStoreJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function healthResponse(body: string): Response {
  const health = parsedRecord(body);
  if (!health
    || health.ok !== true
    || health.matcher !== "persistent-native-v1"
    || typeof health.configured !== "boolean"
    || typeof health.acceptingMutations !== "boolean"
    || health.mode !== "no-value"
    || health.custody !== false) {
    return unavailable();
  }
  if (!health.configured) {
    return noStoreJson({
      ok: true,
      matcher: "persistent-native-v1",
      configured: false,
      acceptingMutations: false,
      mode: "no-value",
      custody: false,
      market: null,
    });
  }
  const market = safeMarket(health.market);
  const checkpoint = safeCheckpoint(health.checkpoint);
  if (!market || !checkpoint
    || typeof health.sequence !== "string" || !DECIMAL.test(health.sequence)
    || typeof health.stateRoot !== "string" || !HEX32.test(health.stateRoot)
    || typeof health.configurationHash !== "string" || !HEX32.test(health.configurationHash)
    || checkpoint.configurationHash !== health.configurationHash
    || checkpoint.stateRoot !== health.stateRoot
    || checkpoint.sequence !== health.sequence) {
    return unavailable();
  }
  return noStoreJson({
    ok: true,
    matcher: "persistent-native-v1",
    configured: true,
    acceptingMutations: health.acceptingMutations,
    mode: "no-value",
    custody: false,
    market,
    sequence: health.sequence,
    stateRoot: health.stateRoot,
    configurationHash: health.configurationHash,
    checkpoint,
  });
}

export async function matcherHealthProxy(env: Record<string, string | undefined> = process.env) {
  const baseUrl = matcherUrl(env);
  if (!baseUrl) return unavailable();
  const response = await fetchLoopbackOperator(new URL("/health", baseUrl));
  if (!response || response.status !== 200) return unavailable();
  return healthResponse(response.body);
}

export async function matcherAccountProxy(
  makerAccountId: string,
  env: Record<string, string | undefined> = process.env,
) {
  const baseUrl = matcherUrl(env);
  if (!baseUrl) return unavailable();
  if (!HEX32.test(makerAccountId)) {
    return noStoreJson({ ok: false, reason: "maker-account-id-invalid" }, 400);
  }
  const response = await fetchLoopbackOperator(new URL(`/v1/accounts/${makerAccountId}`, baseUrl));
  if (!response || response.status !== 200) return unavailable();
  const account = parsedRecord(response.body);
  const checkpoint = safeCheckpoint(account?.checkpoint);
  if (!account || account.ok !== true || account.makerAccountId !== makerAccountId
    || typeof account.configurationHash !== "string" || !HEX32.test(account.configurationHash)
    || typeof account.accountEpoch !== "string" || !DECIMAL.test(account.accountEpoch)
    || typeof account.sequence !== "string" || !DECIMAL.test(account.sequence)
    || !checkpoint
    || checkpoint.configurationHash !== account.configurationHash
    || checkpoint.sequence !== account.sequence) {
    return unavailable();
  }
  return noStoreJson({
    ok: true,
    makerAccountId,
    configurationHash: account.configurationHash,
    accountEpoch: account.accountEpoch,
    sequence: account.sequence,
    checkpoint,
  });
}

export async function matcherOrderProxy(
  request: Request,
  env: Record<string, string | undefined> = process.env,
) {
  const baseUrl = matcherUrl(env);
  if (!baseUrl) return unavailable();
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    return noStoreJson({ ok: false, reason: "content-type-must-be-application-json" }, 415);
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).length > 64 * 1024) {
    return noStoreJson({ ok: false, reason: "request-body-too-large" }, 413);
  }
  const requestId = request.headers.get("idempotency-key");
  if (!requestId || !REQUEST_ID.test(requestId)) {
    return noStoreJson({ ok: false, reason: "idempotency-key-invalid" }, 400);
  }
  const response = await fetchLoopbackOperator(new URL("/v1/orders", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": requestId },
    body,
  });
  if (!response) return unavailable();
  if (response.status !== 200 && response.status !== 201) {
    const status = ORDER_RESPONSE_STATUSES.has(response.status) ? response.status : 503;
    return noStoreJson({ ok: false, reason: status === 503 ? "matcher-unavailable" : "matcher-rejected-order" }, status);
  }
  const result = parsedRecord(response.body);
  const receipt = record(result?.receipt);
  const checkpoint = safeCheckpoint(result?.checkpoint);
  if (!result || result.ok !== true || typeof result.replayed !== "boolean" || !receipt || !checkpoint
    || receipt.version !== 1
    || typeof receipt.sequence !== "string" || !DECIMAL.test(receipt.sequence)
    || receipt.requestId !== requestId
    || receipt.kind !== "accept-order"
    || typeof receipt.status !== "string" || !ORDER_RECEIPT_STATUSES.has(receipt.status)
    || typeof receipt.subjectHash !== "string" || !HEX32.test(receipt.subjectHash)
    || typeof receipt.occurredAtSeconds !== "string" || !DECIMAL.test(receipt.occurredAtSeconds)
    || checkpoint.sequence !== receipt.sequence) {
    return unavailable();
  }
  return noStoreJson({
    ok: true,
    replayed: result.replayed,
    receipt: {
      version: 1,
      sequence: receipt.sequence,
      requestId,
      kind: "accept-order",
      status: receipt.status,
      subjectHash: receipt.subjectHash,
      occurredAtSeconds: receipt.occurredAtSeconds,
    },
    checkpoint,
  }, response.status);
}
