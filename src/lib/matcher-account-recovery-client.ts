import type { Eip1193Provider } from "./evm-wallet.ts";
import { signTypedMatcherAccountRecovery } from "./evm-wallet.ts";
import { typedMatcherAccountRecoveryData } from "./matcher-account-recovery.ts";
import { evmAuthorizedSignerId } from "./matcher-auth.ts";
import type { MatcherMarketDeployment } from "./matcher-market-routing.ts";
import { connectMatcherWallet, type MatcherWalletConnection } from "./matcher-wallet.ts";
import { normalizeHex32, type Hex32 } from "./order-domain.ts";

const MAXIMUM_RECOVERY_PAGE_SIZE = 100;
const DEFAULT_MAXIMUM_RECOVERY_PAGES = 100;
const DECIMAL = /^(0|[1-9][0-9]*)$/;

export type MatcherAccountRecoveryFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type RecoveredMatcherOpenOrder = Readonly<{
  version: 1;
  orderHash: Hex32;
  acceptedSequence: bigint;
  makerAccountId: Hex32;
  authorizedSignerId: Hex32;
  accountEpoch: bigint;
  nonce: bigint;
  currentStatus: "open" | "partially-filled";
  baseAmountAtoms: bigint;
  remainingBaseAtoms: bigint;
  limitPriceTicks: bigint;
  expiry: bigint;
}>;

export type RecoveredMatcherAccountOrders = Readonly<{
  version: 1;
  deployment: MatcherMarketDeployment;
  wallet: MatcherWalletConnection;
  makerAccountId: Hex32;
  configurationHash: Hex32;
  accountEpoch: bigint;
  checkpoint: Readonly<{
    version: 1;
    sequence: bigint;
    recordHash: Hex32;
    stateRoot: Hex32;
    configurationHash: Hex32;
  }>;
  afterSequence: bigint;
  nextAfter: bigint;
  orders: readonly RecoveredMatcherOpenOrder[];
}>;

export type RecoverMatcherAccountOrdersInput = Readonly<{
  fetch: MatcherAccountRecoveryFetch;
  provider: Eip1193Provider;
  deployment: MatcherMarketDeployment;
  afterSequence?: bigint;
  limit?: number;
  maximumPages?: number;
  clock?: () => bigint;
}>;

type JsonRecord = Record<string, unknown>;

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

function exactRecord(value: unknown, keys: readonly string[], label: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const record = value as JsonRecord;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} contains missing or unsupported fields`);
  }
  return record;
}

function decimal(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !DECIMAL.test(value)) throw new TypeError(`${label} must be canonical decimal`);
  return BigInt(value);
}

function hex32(value: unknown, label: string): Hex32 {
  if (typeof value !== "string") throw new TypeError(`${label} must be a 32-byte hexadecimal string`);
  return normalizeHex32(value, label);
}

function pageLimit(value: number | undefined): number {
  const limit = value ?? MAXIMUM_RECOVERY_PAGE_SIZE;
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > MAXIMUM_RECOVERY_PAGE_SIZE) {
    throw new RangeError(`Recovery page limit must be from 1 to ${MAXIMUM_RECOVERY_PAGE_SIZE}`);
  }
  return limit;
}

function maximumPages(value: number | undefined): number {
  const pages = value ?? DEFAULT_MAXIMUM_RECOVERY_PAGES;
  if (!Number.isSafeInteger(pages) || pages <= 0 || pages > DEFAULT_MAXIMUM_RECOVERY_PAGES) {
    throw new RangeError(`Recovery maximum pages must be from 1 to ${DEFAULT_MAXIMUM_RECOVERY_PAGES}`);
  }
  return pages;
}

function startingSequence(value: bigint | undefined): bigint {
  const sequence = value ?? 0n;
  if (typeof sequence !== "bigint" || sequence < 0n || sequence >= (1n << 64n)) {
    throw new RangeError("Recovery starting sequence must fit uint64");
  }
  return sequence;
}

function assertEnabledDeployment(deployment: MatcherMarketDeployment): void {
  const identity = deployment.manifest.market;
  const exactIdentity = (identity.id === "ZEC/USDC" && identity.settlementPair === "ZEC-USDC")
    || (identity.id === "ZEC/USDT" && identity.settlementPair === "ZEC-USDT");
  if (!exactIdentity
    || deployment.enabled !== true
    || deployment.deployed !== true
    || deployment.submissionEnabled !== true
    || deployment.configured !== true
    || deployment.state !== "enabled"
    || deployment.configurationHash === null
    || deployment.orderDomain === null
    || deployment.expectedMatcher === null) {
    throw new Error("Matcher account recovery is disabled by the deployment manifest");
  }
}

function recoveryPath(kind: "challenge" | "orders", deployment: MatcherMarketDeployment): string {
  return `/api/matcher/recovery/${kind}?market=${encodeURIComponent(deployment.manifest.market.id)}`;
}

async function postJson(fetcher: MatcherAccountRecoveryFetch, path: string, body: JsonRecord): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(path, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Matcher account recovery is unavailable");
  }
  if (!response.ok) throw new Error(`Matcher account recovery was rejected (${response.status})`);
  try {
    return JSON.parse(await response.text()) as unknown;
  } catch {
    throw new Error("Matcher account recovery returned malformed JSON");
  }
}

function checkpoint(value: unknown, configurationHash: Hex32) {
  const input = exactRecord(
    value,
    ["version", "sequence", "recordHash", "stateRoot", "configurationHash"],
    "Matcher recovery checkpoint",
  );
  if (input.version !== 1 || input.configurationHash !== configurationHash) {
    throw new Error("Matcher recovery checkpoint does not match the approved deployment");
  }
  return deepFreeze({
    version: 1 as const,
    sequence: decimal(input.sequence, "Matcher recovery checkpoint sequence"),
    recordHash: hex32(input.recordHash, "Matcher recovery checkpoint record hash"),
    stateRoot: hex32(input.stateRoot, "Matcher recovery checkpoint state root"),
    configurationHash,
  });
}

function sameCheckpoint(
  left: RecoveredMatcherAccountOrders["checkpoint"],
  right: RecoveredMatcherAccountOrders["checkpoint"],
): boolean {
  return left.sequence === right.sequence
    && left.recordHash === right.recordHash
    && left.stateRoot === right.stateRoot
    && left.configurationHash === right.configurationHash;
}

function recoveredOrder(
  value: unknown,
  makerAccountId: Hex32,
  accountEpoch: bigint,
  afterSequence: bigint,
  checkpointSequence: bigint,
): RecoveredMatcherOpenOrder {
  const input = exactRecord(value, [
    "version", "orderHash", "acceptedSequence", "makerAccountId", "authorizedSignerId",
    "accountEpoch", "nonce", "currentStatus", "baseAmountAtoms", "remainingBaseAtoms",
    "limitPriceTicks", "expiry",
  ], "Recovered matcher order");
  const acceptedSequence = decimal(input.acceptedSequence, "Recovered matcher order sequence");
  const baseAmountAtoms = decimal(input.baseAmountAtoms, "Recovered matcher base amount");
  const remainingBaseAtoms = decimal(input.remainingBaseAtoms, "Recovered matcher remaining amount");
  const limitPriceTicks = decimal(input.limitPriceTicks, "Recovered matcher price");
  const recoveredEpoch = decimal(input.accountEpoch, "Recovered matcher account epoch");
  if (input.version !== 1
    || input.makerAccountId !== makerAccountId
    || input.authorizedSignerId !== makerAccountId
    || recoveredEpoch !== accountEpoch
    || (input.currentStatus !== "open" && input.currentStatus !== "partially-filled")
    || acceptedSequence <= afterSequence || acceptedSequence > checkpointSequence
    || baseAmountAtoms <= 0n || remainingBaseAtoms <= 0n || remainingBaseAtoms > baseAmountAtoms
    || limitPriceTicks <= 0n
    || (input.currentStatus === "open" && remainingBaseAtoms !== baseAmountAtoms)
    || (input.currentStatus === "partially-filled" && remainingBaseAtoms >= baseAmountAtoms)) {
    throw new Error("Recovered matcher order does not match the authorized account page");
  }
  return deepFreeze({
    version: 1 as const,
    orderHash: hex32(input.orderHash, "Recovered matcher order hash"),
    acceptedSequence,
    makerAccountId,
    authorizedSignerId: makerAccountId,
    accountEpoch,
    nonce: decimal(input.nonce, "Recovered matcher order nonce"),
    currentStatus: input.currentStatus,
    baseAmountAtoms,
    remainingBaseAtoms,
    limitPriceTicks,
    expiry: decimal(input.expiry, "Recovered matcher order expiry"),
  });
}

export async function recoverMatcherAccountOrders(
  input: RecoverMatcherAccountOrdersInput,
): Promise<RecoveredMatcherAccountOrders> {
  assertEnabledDeployment(input.deployment);
  const limit = pageLimit(input.limit);
  const pageBound = maximumPages(input.maximumPages);
  const initialAfter = startingSequence(input.afterSequence);
  const clock = input.clock ?? (() => BigInt(Math.floor(Date.now() / 1_000)));
  const wallet = await connectMatcherWallet(input.provider, input.deployment);
  const domain = input.deployment.orderDomain!;
  const configurationHash = input.deployment.configurationHash!;
  const makerAccountId = evmAuthorizedSignerId(domain.chainId, wallet.address);
  const orders: RecoveredMatcherOpenOrder[] = [];
  const orderHashes = new Set<Hex32>();
  const nonces = new Set<bigint>();
  let afterSequence = initialAfter;
  let approvedCheckpoint: RecoveredMatcherAccountOrders["checkpoint"] | null = null;
  let approvedEpoch: bigint | null = null;

  for (let pageIndex = 0; pageIndex < pageBound; pageIndex += 1) {
    const challengeValue = await postJson(input.fetch, recoveryPath("challenge", input.deployment), {
      version: 1,
      makerAccountId,
      afterSequence: afterSequence.toString(),
      limit,
    });
    const challenge = exactRecord(challengeValue, [
      "ok", "makerAccountId", "configurationHash", "checkpoint", "afterSequence",
      "limit", "challenge", "issuedAtSeconds", "expiresAtSeconds",
    ], "Matcher recovery challenge");
    const challengeCheckpoint = checkpoint(challenge.checkpoint, configurationHash);
    const issuedAtSeconds = decimal(challenge.issuedAtSeconds, "Matcher recovery challenge issue time");
    const expiresAtSeconds = decimal(challenge.expiresAtSeconds, "Matcher recovery challenge expiry");
    const nowSeconds = clock();
    if (challenge.ok !== true
      || challenge.makerAccountId !== makerAccountId
      || challenge.configurationHash !== configurationHash
      || decimal(challenge.afterSequence, "Matcher recovery challenge cursor") !== afterSequence
      || challenge.limit !== limit
      || issuedAtSeconds > nowSeconds || expiresAtSeconds < nowSeconds
      || expiresAtSeconds <= issuedAtSeconds || expiresAtSeconds - issuedAtSeconds > 300n) {
      throw new Error("Matcher recovery challenge does not match the requested account page");
    }
    if (approvedCheckpoint !== null && !sameCheckpoint(approvedCheckpoint, challengeCheckpoint)) {
      throw new Error("Matcher recovery checkpoint changed between pages");
    }
    approvedCheckpoint ??= challengeCheckpoint;
    const challengeHex = hex32(challenge.challenge, "Matcher recovery challenge");
    const authorization = {
      makerAccountId,
      configurationHash,
      checkpointSequence: challengeCheckpoint.sequence,
      checkpointRecordHash: challengeCheckpoint.recordHash,
      checkpointStateRoot: challengeCheckpoint.stateRoot,
      afterSequence,
      limit,
      challenge: challengeHex,
      expiresAtSeconds,
    };
    const signature = await signTypedMatcherAccountRecovery(
      input.provider,
      wallet.address,
      domain.chainId,
      typedMatcherAccountRecoveryData(domain, authorization),
    );
    const pageValue = await postJson(input.fetch, recoveryPath("orders", input.deployment), {
      version: 1,
      makerAccountId,
      configurationHash,
      checkpointSequence: challengeCheckpoint.sequence.toString(),
      checkpointRecordHash: challengeCheckpoint.recordHash,
      checkpointStateRoot: challengeCheckpoint.stateRoot,
      afterSequence: afterSequence.toString(),
      limit,
      challenge: challengeHex,
      expiresAtSeconds: expiresAtSeconds.toString(),
      signature: signature.toLowerCase(),
    });
    const page = exactRecord(pageValue, [
      "ok", "makerAccountId", "configurationHash", "accountEpoch", "afterSequence",
      "nextAfter", "hasMore", "checkpoint", "orders",
    ], "Matcher recovery order page");
    const pageCheckpoint = checkpoint(page.checkpoint, configurationHash);
    const accountEpoch = decimal(page.accountEpoch, "Matcher recovery account epoch");
    const nextAfter = decimal(page.nextAfter, "Matcher recovery next cursor");
    if (page.ok !== true
      || page.makerAccountId !== makerAccountId
      || page.configurationHash !== configurationHash
      || decimal(page.afterSequence, "Matcher recovery page cursor") !== afterSequence
      || typeof page.hasMore !== "boolean"
      || !Array.isArray(page.orders)
      || page.orders.length > limit
      || !sameCheckpoint(challengeCheckpoint, pageCheckpoint)
      || (approvedEpoch !== null && approvedEpoch !== accountEpoch)) {
      throw new Error("Matcher recovery order page does not match its signed challenge");
    }
    approvedEpoch ??= accountEpoch;
    let priorSequence = afterSequence;
    for (const value of page.orders) {
      const order = recoveredOrder(value, makerAccountId, accountEpoch, afterSequence, pageCheckpoint.sequence);
      if (order.acceptedSequence <= priorSequence || orderHashes.has(order.orderHash) || nonces.has(order.nonce)) {
        throw new Error("Matcher recovery returned duplicate or non-monotonic orders");
      }
      priorSequence = order.acceptedSequence;
      orderHashes.add(order.orderHash);
      nonces.add(order.nonce);
      orders.push(order);
    }
    if (nextAfter !== (page.orders.length > 0 ? priorSequence : afterSequence)
      || nextAfter > pageCheckpoint.sequence
      || (page.hasMore && page.orders.length !== limit)) {
      throw new Error("Matcher recovery page cursor is inconsistent");
    }
    afterSequence = nextAfter;
    if (!page.hasMore) {
      return deepFreeze({
        version: 1,
        deployment: input.deployment,
        wallet,
        makerAccountId,
        configurationHash,
        accountEpoch,
        checkpoint: approvedCheckpoint,
        afterSequence: initialAfter,
        nextAfter,
        orders,
      });
    }
  }
  throw new Error("Matcher recovery exceeded the approved page bound");
}
