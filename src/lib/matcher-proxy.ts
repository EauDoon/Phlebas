import { fetchLoopbackOperator, isLoopbackOperatorUrl, operatorUnavailable } from "./operator-url.ts";
import { MATCHER_CONFIGURATION_HEADER } from "./matcher-http.ts";
import { PROXY_AUTH_HEADER, PROXY_FORWARDED_HEADER } from "./rate-limit-http.ts";
import { ETHEREUM_MAINNET_USDC_ASSET, ETHEREUM_MAINNET_USDT_ASSET } from "./mainnet-assets.ts";
import { parseStrictJson } from "../../services/matcher/strict-json.ts";
import type { JournalValue } from "../../services/matcher/journal.ts";

const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HEX32 = /^0x[0-9a-f]{64}$/;
const DECIMAL = /^(?:0|[1-9][0-9]*)$/;
const MUTATION_RESPONSE_STATUSES = new Set([400, 401, 409, 413, 415, 422, 429, 503]);
const ORDER_RECEIPT_STATUSES = new Set([
  "open",
  "filled",
  "partially-filled",
  "ioc-remainder-cancelled",
  "fok-rejected",
  "unfilled",
]);
const CANCELLATION_RECEIPT_STATUSES = new Set(["cancelled"]);
const EPOCH_RECEIPT_STATUSES = new Set(["epoch-advanced"]);
const MATCHER_REQUEST_BYTES = 64 * 1024;
const MAXIMUM_JSON_DEPTH = 32;
const MAXIMUM_JSON_NODES = 10_000;
const MAXIMUM_RECOVERY_PAGE_SIZE = 100;

const MUTATION_ACTIONS = {
  "accept-order": { endpoint: "/v1/orders", receiptStatuses: ORDER_RECEIPT_STATUSES },
  "cancel-order": { endpoint: "/v1/order-cancellations", receiptStatuses: CANCELLATION_RECEIPT_STATUSES },
  "advance-epoch": { endpoint: "/v1/account-epochs", receiptStatuses: EPOCH_RECEIPT_STATUSES },
} as const;

type JsonRecord = Record<string, unknown>;
type StrictJsonValue = JournalValue;
type StrictJsonRecord = { [key: string]: StrictJsonValue };
type MatcherIngressAsset = Readonly<{
  network: string;
  asset: string;
  environment: string;
  decimals: number;
}>;

export type MatcherIngressDeployment = Readonly<{
  enabled: boolean;
  expectedMatcher: Readonly<{
    configurationHash: string;
    market: Readonly<{
      base: MatcherIngressAsset;
      quote: MatcherIngressAsset;
    }>;
  }> | null;
}>;

export type MatcherMutationAction = keyof typeof MUTATION_ACTIONS;

function matcherUrl(
  env: Record<string, string | undefined>,
  deployment: MatcherIngressDeployment,
): string | null {
  const quoteAsset = deployment.expectedMatcher?.market.quote.asset;
  const value = quoteAsset === ETHEREUM_MAINNET_USDC_ASSET
    ? env.PHLEBAS_MATCHER_USDC_URL ?? env.PHLEBAS_MATCHER_URL
    : quoteAsset === ETHEREUM_MAINNET_USDT_ASSET
      ? env.PHLEBAS_MATCHER_USDT_URL
      : undefined;
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

function strictJsonRecord(input: string): StrictJsonRecord | null {
  // The canonical parser the matcher itself trusts on its ingress. The
  // wrapper only converts the parser's throw into the null the proxy's
  // validation helpers branch on; it adds no grammar of its own.
  try {
    return record(parseStrictJson(input, { maximumDepth: MAXIMUM_JSON_DEPTH, maximumNodes: MAXIMUM_JSON_NODES })) as StrictJsonRecord | null;
  } catch {
    return null;
  }
}

function exactKeys(value: StrictJsonRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const allowed = [...expected].sort();
  return actual.length === allowed.length && actual.every((key, index) => key === allowed[index]);
}

function validMutationBody(
  body: string,
  requestedAction: MatcherMutationAction | null,
  requestId: string,
): Readonly<{ action: MatcherMutationAction; expectedSubjectHash: string | null }> | null {
  const value = strictJsonRecord(body);
  const action = value && typeof value.kind === "string" ? matcherMutationAction(value.kind) : null;
  if (!value || !action || (requestedAction !== null && action !== requestedAction)
    || value.version !== 1 || value.requestId !== requestId
    || typeof value.occurredAtSeconds !== "string" || !DECIMAL.test(value.occurredAtSeconds)) {
    return null;
  }
  if (action === "accept-order") {
    return exactKeys(value, ["version", "requestId", "occurredAtSeconds", "kind", "submission"])
      && value.submission !== null && typeof value.submission === "object" && !Array.isArray(value.submission)
      ? { action, expectedSubjectHash: null }
      : null;
  }
  if (action === "cancel-order") {
    return exactKeys(value, ["version", "requestId", "occurredAtSeconds", "kind", "orderHash", "signature"])
      && typeof value.orderHash === "string" && HEX32.test(value.orderHash)
      && typeof value.signature === "string"
      ? { action, expectedSubjectHash: value.orderHash }
      : null;
  }
  return exactKeys(value, ["version", "requestId", "occurredAtSeconds", "kind", "makerAccountId", "nextEpoch", "authorizedSignerId", "signature"])
    && typeof value.makerAccountId === "string" && HEX32.test(value.makerAccountId)
    && typeof value.nextEpoch === "string" && DECIMAL.test(value.nextEpoch)
    && typeof value.authorizedSignerId === "string" && HEX32.test(value.authorizedSignerId)
    && typeof value.signature === "string"
    ? { action, expectedSubjectHash: value.makerAccountId }
    : null;
}

export function matcherMutationAction(value: string | null): MatcherMutationAction | null {
  return typeof value === "string" && Object.hasOwn(MUTATION_ACTIONS, value)
    ? value as MatcherMutationAction
    : null;
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

function strictCheckpoint(value: StrictJsonValue | undefined): JsonRecord | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const checkpoint = value as StrictJsonRecord;
  return exactKeys(checkpoint, ["version", "sequence", "recordHash", "stateRoot", "configurationHash"])
    ? safeCheckpoint(checkpoint)
    : null;
}

function validRecoveryChallengeBody(body: string): StrictJsonRecord | null {
  const value = strictJsonRecord(body);
  if (!value || !exactKeys(value, ["version", "makerAccountId", "afterSequence", "limit"])
    || value.version !== 1
    || typeof value.makerAccountId !== "string" || !HEX32.test(value.makerAccountId)
    || typeof value.afterSequence !== "string" || !DECIMAL.test(value.afterSequence)
    || typeof value.limit !== "number" || !Number.isSafeInteger(value.limit)
    || value.limit <= 0 || value.limit > MAXIMUM_RECOVERY_PAGE_SIZE) {
    return null;
  }
  return value;
}

const RECOVERY_PROOF_FIELDS = [
  "version", "makerAccountId", "configurationHash", "checkpointSequence",
  "checkpointRecordHash", "checkpointStateRoot", "afterSequence", "limit",
  "challenge", "expiresAtSeconds", "signature",
] as const;

function validRecoveryProofBody(body: string): StrictJsonRecord | null {
  const value = strictJsonRecord(body);
  if (!value || !exactKeys(value, RECOVERY_PROOF_FIELDS)
    || value.version !== 1
    || typeof value.makerAccountId !== "string" || !HEX32.test(value.makerAccountId)
    || typeof value.configurationHash !== "string" || !HEX32.test(value.configurationHash)
    || typeof value.checkpointSequence !== "string" || !DECIMAL.test(value.checkpointSequence)
    || typeof value.checkpointRecordHash !== "string" || !HEX32.test(value.checkpointRecordHash)
    || typeof value.checkpointStateRoot !== "string" || !HEX32.test(value.checkpointStateRoot)
    || typeof value.afterSequence !== "string" || !DECIMAL.test(value.afterSequence)
    || typeof value.limit !== "number" || !Number.isSafeInteger(value.limit)
    || value.limit <= 0 || value.limit > MAXIMUM_RECOVERY_PAGE_SIZE
    || typeof value.challenge !== "string" || !HEX32.test(value.challenge)
    || typeof value.expiresAtSeconds !== "string" || !DECIMAL.test(value.expiresAtSeconds)
    || typeof value.signature !== "string" || !/^0x[0-9a-f]{130}$/.test(value.signature)) {
    return null;
  }
  return value;
}

function safeRecoveryOrder(
  input: StrictJsonValue,
  makerAccountId: string,
  accountEpoch: string,
  afterSequence: bigint,
  checkpointSequence: bigint,
): JsonRecord | null {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return null;
  const order = input as StrictJsonRecord;
  if (!exactKeys(order, [
    "version", "orderHash", "acceptedSequence", "makerAccountId", "authorizedSignerId",
    "accountEpoch", "nonce", "currentStatus", "baseAmountAtoms", "remainingBaseAtoms",
    "limitPriceTicks", "expiry",
  ])
    || order.version !== 1
    || typeof order.orderHash !== "string" || !HEX32.test(order.orderHash)
    || typeof order.acceptedSequence !== "string" || !DECIMAL.test(order.acceptedSequence)
    || order.makerAccountId !== makerAccountId || order.authorizedSignerId !== makerAccountId
    || order.accountEpoch !== accountEpoch
    || typeof order.nonce !== "string" || !DECIMAL.test(order.nonce)
    || (order.currentStatus !== "open" && order.currentStatus !== "partially-filled")
    || typeof order.baseAmountAtoms !== "string" || !DECIMAL.test(order.baseAmountAtoms)
    || typeof order.remainingBaseAtoms !== "string" || !DECIMAL.test(order.remainingBaseAtoms)
    || typeof order.limitPriceTicks !== "string" || !DECIMAL.test(order.limitPriceTicks)
    || typeof order.expiry !== "string" || !DECIMAL.test(order.expiry)) {
    return null;
  }
  const sequence = BigInt(order.acceptedSequence);
  const baseAmount = BigInt(order.baseAmountAtoms);
  const remaining = BigInt(order.remainingBaseAtoms);
  if (sequence <= afterSequence || sequence > checkpointSequence
    || baseAmount <= 0n || remaining <= 0n || remaining > baseAmount
    || BigInt(order.limitPriceTicks) <= 0n
    || (order.currentStatus === "open" && remaining !== baseAmount)
    || (order.currentStatus === "partially-filled" && remaining >= baseAmount)) {
    return null;
  }
  return {
    version: 1,
    orderHash: order.orderHash,
    acceptedSequence: order.acceptedSequence,
    makerAccountId,
    authorizedSignerId: makerAccountId,
    accountEpoch,
    nonce: order.nonce,
    currentStatus: order.currentStatus,
    baseAmountAtoms: order.baseAmountAtoms,
    remainingBaseAtoms: order.remainingBaseAtoms,
    limitPriceTicks: order.limitPriceTicks,
    expiry: order.expiry,
  };
}

function unavailable() {
  return operatorUnavailable("matcher-unavailable", { matcher: "in-browser" });
}

/**
 * Trusted-proxy identity headers for the matcher (closes audit review-2).
 *
 * When the operator configured PHLEBAS_MATCHER_PROXY_KEY, the proxy proves
 * its hop with that key and passes the client identity it observed (the
 * edge-established first X-Forwarded-For hop) in the dedicated
 * proxy-established header. The matcher raises the per-client rate-limit
 * buckets only when the hop key matches its own configuration; every other
 * request keeps the socket-address identity, so this fails closed.
 *
 * The upstream header set is built literally, so a client-supplied
 * x-phlebas-proxy-auth or x-phlebas-forwarded-for can never pass through:
 * only the values this function derives from the trusted edge headers and
 * the operator's own environment reach the matcher.
 */
export function proxyIdentityHeaders(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const key = env.PHLEBAS_MATCHER_PROXY_KEY;
  if (typeof key !== "string" || key.length < 16 || key.length > 256) return {};
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first === undefined || first === "" || first.length > 64 || !/^[!-~]+$/.test(first)) return {};
  return {
    [PROXY_AUTH_HEADER]: key,
    [PROXY_FORWARDED_HEADER]: first,
  };
}

function noStoreJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function readBoundedRequestBody(request: Request): Promise<string | null> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && (!/^(?:0|[1-9][0-9]*)$/.test(declaredLength)
    || BigInt(declaredLength) > BigInt(MATCHER_REQUEST_BYTES))) {
    await request.body?.cancel();
    return null;
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MATCHER_REQUEST_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
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

function approvedRuntimeHealthMatches(
  health: JsonRecord,
  deployment: MatcherIngressDeployment,
): boolean {
  const expected = deployment.expectedMatcher;
  if (!deployment.enabled || expected === null
    || health.acceptingMutations !== true
    || health.configurationHash !== expected.configurationHash) return false;
  const market = record(health.market);
  const sameAsset = (actual: JsonRecord | null, approved: MatcherIngressAsset) => actual !== null
    && actual.network === approved.network
    && actual.asset === approved.asset
    && actual.environment === approved.environment
    && actual.decimals === approved.decimals;
  return market !== null
    && sameAsset(record(market.base), expected.market.base)
    && sameAsset(record(market.quote), expected.market.quote);
}

async function approvedRuntimeHealth(
  baseUrl: string,
  deployment: MatcherIngressDeployment,
): Promise<JsonRecord | null> {
  if (!deployment.enabled || deployment.expectedMatcher === null) return null;
  const response = await fetchLoopbackOperator(new URL("/health", baseUrl));
  if (!response || response.status !== 200) return null;
  const checked = healthResponse(response.body);
  if (checked.status !== 200) return null;
  const health = await checked.json() as JsonRecord;
  return approvedRuntimeHealthMatches(health, deployment) ? health : null;
}

async function approvedMutationRuntime(
  baseUrl: string,
  deployment: MatcherIngressDeployment,
): Promise<boolean> {
  return await approvedRuntimeHealth(baseUrl, deployment) !== null;
}

export async function matcherHealthProxy(
  env: Record<string, string | undefined> = process.env,
  deployment: MatcherIngressDeployment | null = null,
) {
  if (!deployment || !deployment.enabled || deployment.expectedMatcher === null) return unavailable();
  const baseUrl = matcherUrl(env, deployment);
  if (!baseUrl) return unavailable();
  const health = await approvedRuntimeHealth(baseUrl, deployment);
  return health ? noStoreJson(health) : unavailable();
}

export async function matcherAccountProxy(
  makerAccountId: string,
  env: Record<string, string | undefined> = process.env,
  deployment: MatcherIngressDeployment | null = null,
) {
  if (!deployment || !deployment.enabled || deployment.expectedMatcher === null) return unavailable();
  const baseUrl = matcherUrl(env, deployment);
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
    || account.configurationHash !== deployment.expectedMatcher.configurationHash
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

function recoveryRejected(status: number): Response {
  if ([400, 401, 409, 413, 415, 422, 429].includes(status)) {
    return noStoreJson({ ok: false, reason: "matcher-recovery-rejected" }, status);
  }
  return unavailable();
}

async function recoveryRequestBody(request: Request): Promise<string | Response> {
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    return noStoreJson({ ok: false, reason: "content-type-must-be-application-json" }, 415);
  }
  const body = await readBoundedRequestBody(request);
  return body === null
    ? noStoreJson({ ok: false, reason: "request-body-too-large" }, 413)
    : body;
}

export async function matcherRecoveryChallengeProxy(
  request: Request,
  env: Record<string, string | undefined> = process.env,
  deployment: MatcherIngressDeployment | null = null,
) {
  if (!deployment || !deployment.enabled || deployment.expectedMatcher === null) return unavailable();
  const baseUrl = matcherUrl(env, deployment);
  if (!baseUrl) return unavailable();
  const bodyOrResponse = await recoveryRequestBody(request);
  if (bodyOrResponse instanceof Response) return bodyOrResponse;
  const submitted = validRecoveryChallengeBody(bodyOrResponse);
  if (!submitted) return noStoreJson({ ok: false, reason: "matcher-recovery-body-invalid" }, 400);
  if (!await approvedMutationRuntime(baseUrl, deployment)) return unavailable();
  const upstream = await fetchLoopbackOperator(new URL("/v1/account-order-challenges", baseUrl), {
    method: "POST",
    headers: {
      ...proxyIdentityHeaders(request, env),
      "content-type": "application/json",
      [MATCHER_CONFIGURATION_HEADER]: deployment.expectedMatcher.configurationHash,
    },
    body: bodyOrResponse,
  });
  if (!upstream) return unavailable();
  if (upstream.status !== 200) return recoveryRejected(upstream.status);
  const result = strictJsonRecord(upstream.body);
  if (!result || !exactKeys(result, [
    "ok", "makerAccountId", "configurationHash", "checkpoint", "afterSequence",
    "limit", "challenge", "issuedAtSeconds", "expiresAtSeconds",
  ])) return unavailable();
  const checkpoint = strictCheckpoint(result.checkpoint);
  if (result.ok !== true
    || result.makerAccountId !== submitted.makerAccountId
    || result.configurationHash !== deployment.expectedMatcher.configurationHash
    || !checkpoint || checkpoint.configurationHash !== deployment.expectedMatcher.configurationHash
    || result.afterSequence !== submitted.afterSequence
    || result.limit !== submitted.limit
    || typeof result.challenge !== "string" || !HEX32.test(result.challenge)
    || typeof result.issuedAtSeconds !== "string" || !DECIMAL.test(result.issuedAtSeconds)
    || typeof result.expiresAtSeconds !== "string" || !DECIMAL.test(result.expiresAtSeconds)
    || BigInt(result.expiresAtSeconds) <= BigInt(result.issuedAtSeconds)
    || BigInt(result.expiresAtSeconds) - BigInt(result.issuedAtSeconds) > 300n) {
    return unavailable();
  }
  return noStoreJson({
    ok: true,
    makerAccountId: result.makerAccountId,
    configurationHash: result.configurationHash,
    checkpoint,
    afterSequence: result.afterSequence,
    limit: result.limit,
    challenge: result.challenge,
    issuedAtSeconds: result.issuedAtSeconds,
    expiresAtSeconds: result.expiresAtSeconds,
  });
}

export async function matcherRecoveryOrdersProxy(
  request: Request,
  env: Record<string, string | undefined> = process.env,
  deployment: MatcherIngressDeployment | null = null,
) {
  if (!deployment || !deployment.enabled || deployment.expectedMatcher === null) return unavailable();
  const baseUrl = matcherUrl(env, deployment);
  if (!baseUrl) return unavailable();
  const bodyOrResponse = await recoveryRequestBody(request);
  if (bodyOrResponse instanceof Response) return bodyOrResponse;
  const submitted = validRecoveryProofBody(bodyOrResponse);
  if (!submitted || submitted.configurationHash !== deployment.expectedMatcher.configurationHash) {
    return noStoreJson({ ok: false, reason: "matcher-recovery-body-invalid" }, 400);
  }
  if (!await approvedMutationRuntime(baseUrl, deployment)) return unavailable();
  const upstream = await fetchLoopbackOperator(new URL("/v1/account-open-orders", baseUrl), {
    method: "POST",
    headers: {
      ...proxyIdentityHeaders(request, env),
      "content-type": "application/json",
      [MATCHER_CONFIGURATION_HEADER]: deployment.expectedMatcher.configurationHash,
    },
    body: bodyOrResponse,
  });
  if (!upstream) return unavailable();
  if (upstream.status !== 200) return recoveryRejected(upstream.status);
  const result = strictJsonRecord(upstream.body);
  if (!result || !exactKeys(result, [
    "ok", "makerAccountId", "configurationHash", "accountEpoch", "afterSequence",
    "nextAfter", "hasMore", "checkpoint", "orders",
  ])) return unavailable();
  const checkpoint = strictCheckpoint(result.checkpoint);
  if (result.ok !== true
    || result.makerAccountId !== submitted.makerAccountId
    || result.configurationHash !== deployment.expectedMatcher.configurationHash
    || typeof result.accountEpoch !== "string" || !DECIMAL.test(result.accountEpoch)
    || result.afterSequence !== submitted.afterSequence
    || typeof result.nextAfter !== "string" || !DECIMAL.test(result.nextAfter)
    || typeof result.hasMore !== "boolean"
    || !checkpoint
    || checkpoint.configurationHash !== deployment.expectedMatcher.configurationHash
    || checkpoint.sequence !== submitted.checkpointSequence
    || checkpoint.recordHash !== submitted.checkpointRecordHash
    || checkpoint.stateRoot !== submitted.checkpointStateRoot
    || !Array.isArray(result.orders)
    || result.orders.length > Number(submitted.limit)) {
    return unavailable();
  }
  const afterSequence = BigInt(submitted.afterSequence as string);
  const checkpointSequence = BigInt(submitted.checkpointSequence as string);
  const orders: JsonRecord[] = [];
  const hashes = new Set<string>();
  const nonces = new Set<string>();
  let priorSequence = afterSequence;
  for (const input of result.orders) {
    const order = safeRecoveryOrder(input, result.makerAccountId as string, result.accountEpoch, afterSequence, checkpointSequence);
    if (!order || hashes.has(order.orderHash as string) || nonces.has(order.nonce as string)
      || BigInt(order.acceptedSequence as string) <= priorSequence) return unavailable();
    hashes.add(order.orderHash as string);
    nonces.add(order.nonce as string);
    priorSequence = BigInt(order.acceptedSequence as string);
    orders.push(order);
  }
  const nextAfter = BigInt(result.nextAfter);
  if (nextAfter !== (orders.length > 0 ? priorSequence : afterSequence)
    || nextAfter > checkpointSequence
    || (result.hasMore && orders.length !== Number(submitted.limit))) {
    return unavailable();
  }
  return noStoreJson({
    ok: true,
    makerAccountId: result.makerAccountId,
    configurationHash: result.configurationHash,
    accountEpoch: result.accountEpoch,
    afterSequence: result.afterSequence,
    nextAfter: result.nextAfter,
    hasMore: result.hasMore,
    checkpoint,
    orders,
  });
}

export async function matcherMutationProxy(
  request: Request,
  requestedAction: string | null,
  env: Record<string, string | undefined> = process.env,
  deployment: MatcherIngressDeployment | null = null,
) {
  if (!deployment || !deployment.enabled || deployment.expectedMatcher === null) return unavailable();
  const baseUrl = matcherUrl(env, deployment);
  if (!baseUrl) return unavailable();
  const expectedAction = requestedAction === null ? null : matcherMutationAction(requestedAction);
  if (requestedAction !== null && !expectedAction) return noStoreJson({ ok: false, reason: "matcher-action-invalid" }, 400);
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    return noStoreJson({ ok: false, reason: "content-type-must-be-application-json" }, 415);
  }
  const body = await readBoundedRequestBody(request);
  if (body === null) {
    return noStoreJson({ ok: false, reason: "request-body-too-large" }, 413);
  }
  const requestId = request.headers.get("idempotency-key");
  if (!requestId || !REQUEST_ID.test(requestId)) {
    return noStoreJson({ ok: false, reason: "idempotency-key-invalid" }, 400);
  }
  const mutationBody = validMutationBody(body, expectedAction, requestId);
  if (!mutationBody) {
    return noStoreJson({ ok: false, reason: "matcher-action-body-invalid" }, 400);
  }
  if (!await approvedMutationRuntime(baseUrl, deployment)) return unavailable();
  const mutation = MUTATION_ACTIONS[mutationBody.action];
  const response = await fetchLoopbackOperator(new URL(mutation.endpoint, baseUrl), {
    method: "POST",
    headers: {
      ...proxyIdentityHeaders(request, env),
      "content-type": "application/json",
      "idempotency-key": requestId,
      [MATCHER_CONFIGURATION_HEADER]: deployment.expectedMatcher.configurationHash,
    },
    body,
  });
  if (!response) return unavailable();
  if (response.status !== 200 && response.status !== 201) {
    const status = MUTATION_RESPONSE_STATUSES.has(response.status) ? response.status : 503;
    const reason = mutationBody.action === "accept-order" ? "matcher-rejected-order" : "matcher-rejected-control";
    return noStoreJson({ ok: false, reason: status === 503 ? "matcher-unavailable" : reason }, status);
  }
  const result = parsedRecord(response.body);
  const receipt = record(result?.receipt);
  const receiptCheckpoint = safeCheckpoint(result?.receiptCheckpoint);
  const checkpoint = safeCheckpoint(result?.checkpoint);
  if (!result || result.ok !== true || typeof result.replayed !== "boolean" || !receipt || !receiptCheckpoint || !checkpoint
    || receipt.version !== 1
    || typeof receipt.sequence !== "string" || !DECIMAL.test(receipt.sequence)
    || receipt.requestId !== requestId
    || receipt.kind !== mutationBody.action
    || typeof receipt.status !== "string" || !mutation.receiptStatuses.has(receipt.status)
    || typeof receipt.subjectHash !== "string" || !HEX32.test(receipt.subjectHash)
    || (mutationBody.expectedSubjectHash !== null && receipt.subjectHash !== mutationBody.expectedSubjectHash)
    || typeof receipt.occurredAtSeconds !== "string" || !DECIMAL.test(receipt.occurredAtSeconds)
    || receiptCheckpoint.sequence !== receipt.sequence
    || receiptCheckpoint.configurationHash !== deployment.expectedMatcher.configurationHash
    || checkpoint.configurationHash !== deployment.expectedMatcher.configurationHash
    || BigInt(checkpoint.sequence as string) < BigInt(receiptCheckpoint.sequence as string)
    || (checkpoint.sequence === receiptCheckpoint.sequence
      && (checkpoint.recordHash !== receiptCheckpoint.recordHash || checkpoint.stateRoot !== receiptCheckpoint.stateRoot))) {
    return unavailable();
  }
  return noStoreJson({
    ok: true,
    replayed: result.replayed,
    receipt: {
      version: 1,
      sequence: receipt.sequence,
      requestId,
      kind: mutationBody.action,
      status: receipt.status,
      subjectHash: receipt.subjectHash,
      occurredAtSeconds: receipt.occurredAtSeconds,
    },
    receiptCheckpoint,
    checkpoint,
  }, response.status);
}

export async function matcherOrderProxy(
  request: Request,
  env: Record<string, string | undefined> = process.env,
  deployment: MatcherIngressDeployment | null = null,
) {
  return matcherMutationProxy(request, "accept-order", env, deployment);
}
