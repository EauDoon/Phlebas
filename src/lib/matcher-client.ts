import {
  assertSettlementAccountRoles,
  assertSettlementAccounts,
  type AtomicSwapPair,
  type WalletSettlementAccounts,
} from "./atomic-swap-plan.ts";
import {
  ORDER_DOMAIN_NAME,
  ORDER_DOMAIN_VERSION,
  createOrderDomain,
  hashOrderDomain,
  type OrderDomain,
  type TypedOrderIntent,
} from "./eip712-order.ts";
import {
  createEvmEoaSignatureVerifier,
  evmAuthorizedSignerId,
  verifySignedOrderIntent,
} from "./matcher-auth.ts";
import {
  UINT64_MAX,
  assetIdentifier,
  chainIdentifier,
  normalizeAddress,
  normalizeHex32,
  type Hex32,
} from "./order-domain.ts";
import { assertOrderPolicy, type OrderPair } from "./order-policy.ts";

export const MATCHER_API_PATH = "/api/matcher" as const;
export const MATCHER_ORDER_OPERATION = "/v1/orders" as const;
export const MATCHER_IDEMPOTENCY_HEADER = "idempotency-key" as const;
export const MATCHER_BUY_ONLY_REASON = "matcher-client-buy-orders-only" as const;

const MATCHER_SERVICE = "persistent-native-v1" as const;
const MAX_MATCHER_BODY_BYTES = 64 * 1024;
const ZERO_HEX32 = `0x${"00".repeat(32)}`;
const ORDER_KEYS = [
  "makerAccountId",
  "authorizedSignerId",
  "baseChainId",
  "baseAssetId",
  "quoteChainId",
  "quoteAssetId",
  "side",
  "baseAmountAtoms",
  "limitPriceTicks",
  "nonce",
  "accountEpoch",
  "expiry",
  "salt",
  "recipientAccountId",
  "timeInForce",
  "maximumFeeBps",
  "allowedVenues",
  "settlementAdapterId",
] as const;

export type MatcherMarketIdentity = AtomicSwapPair;

export type ExpectedMatcherIdentity = Readonly<{
  configurationHash: Hex32;
  orderDomain: OrderDomain;
  market: MatcherMarketIdentity;
  settlementAdapterId: Hex32;
}>;

export type VerifiedMatcherIdentity = Readonly<{
  configurationHash: Hex32;
  domainHash: Hex32;
  market: MatcherMarketIdentity;
  orderPair: OrderPair;
  settlementAdapterId: Hex32;
}>;

export type VerifiedMatcherAccount = Readonly<{
  makerAccountId: Hex32;
  configurationHash: Hex32;
  accountEpoch: bigint;
  sequence: bigint;
  checkpoint: Readonly<{
    version: 1;
    sequence: bigint;
    recordHash: Hex32;
    stateRoot: Hex32;
    configurationHash: Hex32;
  }>;
}>;

export type MatcherOrderSubmissionInput = Readonly<{
  matcherHealth: unknown;
  expectedMatcher: ExpectedMatcherIdentity;
  requestId: string;
  occurredAtSeconds: bigint;
  order: TypedOrderIntent;
  signature: string;
  accounts: WalletSettlementAccounts;
}>;

type SerializedOrderIntent = Readonly<{
  makerAccountId: Hex32;
  authorizedSignerId: Hex32;
  baseChainId: Hex32;
  baseAssetId: Hex32;
  quoteChainId: Hex32;
  quoteAssetId: Hex32;
  side: TypedOrderIntent["side"];
  baseAmountAtoms: string;
  limitPriceTicks: string;
  nonce: string;
  accountEpoch: string;
  expiry: string;
  salt: Hex32;
  recipientAccountId: Hex32;
  timeInForce: TypedOrderIntent["timeInForce"];
  maximumFeeBps: string;
  allowedVenues: number;
  settlementAdapterId: Hex32;
}>;

export type MatcherOrderPayload = Readonly<{
  version: 1;
  requestId: string;
  occurredAtSeconds: string;
  kind: "accept-order";
  submission: Readonly<{
    order: SerializedOrderIntent;
    signature: string;
    accounts: WalletSettlementAccounts;
  }>;
}>;

export type MatcherOrderRequest = Readonly<{
  path: typeof MATCHER_API_PATH;
  method: "POST";
  operation: typeof MATCHER_ORDER_OPERATION;
  requestId: string;
  idempotencyKey: string;
  identity: VerifiedMatcherIdentity;
  headers: Readonly<{
    "content-type": "application/json";
    "idempotency-key": string;
  }>;
  body: string;
}>;

export type VerifiedMatcherOrderReceipt = Readonly<{
  replayed: boolean;
  receipt: Readonly<{
    version: 1;
    sequence: bigint;
    requestId: string;
    kind: "accept-order";
    status: "open" | "filled" | "partially-filled" | "ioc-remainder-cancelled" | "fok-rejected" | "unfilled";
    subjectHash: Hex32;
    occurredAtSeconds: bigint;
  }>;
  checkpoint: Readonly<{
    version: 1;
    sequence: bigint;
    recordHash: Hex32;
    stateRoot: Hex32;
    configurationHash: Hex32;
  }>;
}>;

export type MatcherOrderReceiptExpectation = Readonly<{
  expectedMatcher: ExpectedMatcherIdentity;
  requestId: string;
  subjectHash: Hex32;
  occurredAtSeconds: bigint;
}>;

type PreparedSubmission = Readonly<{
  identity: VerifiedMatcherIdentity;
  requestId: string;
  payload: MatcherOrderPayload;
}>;

export class MatcherOrderClientError extends Error {
  readonly reason: typeof MATCHER_BUY_ONLY_REASON;

  constructor(reason: typeof MATCHER_BUY_ONLY_REASON) {
    super(reason);
    this.name = "MatcherOrderClientError";
    this.reason = reason;
  }
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const allowed = [...expected].sort();
  if (actual.length !== allowed.length || actual.some((key, index) => key !== allowed[index])) {
    throw new TypeError(`${label} has missing or unsupported fields`);
  }
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  return value;
}

function canonicalHex32(value: unknown, label: string): Hex32 {
  const input = stringValue(value, label);
  const normalized = normalizeHex32(input, label);
  if (input !== normalized) throw new TypeError(`${label} must use canonical lowercase hexadecimal`);
  return normalized;
}

function canonicalAsset(value: unknown, label: string): MatcherMarketIdentity["base"] {
  const asset = objectValue(value, `${label} market identity`);
  assertExactKeys(asset, ["network", "asset", "environment", "decimals"], `${label} market identity`);
  const network = stringValue(asset.network, `${label} network`);
  const assetId = stringValue(asset.asset, `${label} asset`);
  const environment = asset.environment;
  if (environment !== "testnet" && environment !== "mainnet") {
    throw new TypeError(`${label} environment must be testnet or mainnet`);
  }
  if (typeof asset.decimals !== "number" || !Number.isSafeInteger(asset.decimals)
    || asset.decimals < 0 || asset.decimals > 255) {
    throw new RangeError(`${label} decimals must be an integer from 0 to 255`);
  }
  chainIdentifier(network);
  assetIdentifier(assetId);
  if (!assetId.startsWith(`${network}/`)) throw new Error(`${label} asset must be on its declared network`);
  return { network, asset: assetId, environment, decimals: asset.decimals };
}

function canonicalMarket(value: unknown, label: string): MatcherMarketIdentity {
  const market = objectValue(value, label);
  assertExactKeys(market, ["base", "quote"], label);
  const base = canonicalAsset(market.base, "Base");
  const quote = canonicalAsset(market.quote, "Quote");
  if (base.network === quote.network && base.asset === quote.asset) {
    throw new Error("Matcher base and quote assets must differ");
  }
  return { base, quote };
}

function sameMarket(left: MatcherMarketIdentity, right: MatcherMarketIdentity): boolean {
  return left.base.network === right.base.network
    && left.base.asset === right.base.asset
    && left.base.environment === right.base.environment
    && left.base.decimals === right.base.decimals
    && left.quote.network === right.quote.network
    && left.quote.asset === right.quote.asset
    && left.quote.environment === right.quote.environment
    && left.quote.decimals === right.quote.decimals;
}

function canonicalExpectedIdentity(expected: ExpectedMatcherIdentity): VerifiedMatcherIdentity {
  const configurationHash = canonicalHex32(expected.configurationHash, "Expected matcher configuration hash");
  if (configurationHash === ZERO_HEX32) throw new RangeError("Expected matcher configuration hash cannot be zero");
  if (expected.orderDomain.name !== ORDER_DOMAIN_NAME || expected.orderDomain.version !== ORDER_DOMAIN_VERSION) {
    throw new Error("Expected matcher order domain is unsupported");
  }
  const orderDomain = createOrderDomain(expected.orderDomain.chainId, expected.orderDomain.verifyingContract);
  const domainHash = hashOrderDomain(orderDomain);
  const market = canonicalMarket(expected.market, "Expected matcher market");
  const settlementAdapterId = canonicalHex32(expected.settlementAdapterId, "Expected settlement adapter ID");
  if (settlementAdapterId === ZERO_HEX32) throw new RangeError("Expected settlement adapter ID cannot be zero");
  return {
    configurationHash,
    domainHash,
    market,
    orderPair: {
      baseChainId: chainIdentifier(market.base.network),
      baseAssetId: assetIdentifier(market.base.asset),
      quoteChainId: chainIdentifier(market.quote.network),
      quoteAssetId: assetIdentifier(market.quote.asset),
    },
    settlementAdapterId,
  };
}

export function assertMatcherHealthIdentity(
  healthValue: unknown,
  expected: ExpectedMatcherIdentity,
): VerifiedMatcherIdentity {
  const identity = canonicalExpectedIdentity(expected);
  const health = objectValue(healthValue, "Matcher health");
  if (health.ok !== true
    || health.matcher !== MATCHER_SERVICE
    || health.configured !== true
    || health.acceptingMutations !== true) {
    throw new Error("Matcher health does not identify an accepting persistent matcher");
  }
  if (health.mode !== "no-value" || health.custody !== false) {
    throw new Error("Matcher health does not preserve the no-value non-custodial boundary");
  }
  const configurationHash = canonicalHex32(health.configurationHash, "Matcher health configuration hash");
  if (configurationHash !== identity.configurationHash) {
    throw new Error("Matcher health configuration does not match the expected matcher");
  }
  const market = canonicalMarket(health.market, "Matcher health market");
  if (!sameMarket(market, identity.market)) {
    throw new Error("Matcher health market does not match the expected market");
  }
  return deepFreeze(identity);
}

function canonicalRequestId(value: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
    throw new TypeError("Request ID is invalid");
  }
  return value;
}

function canonicalOccurredAtSeconds(value: bigint): bigint {
  if (typeof value !== "bigint" || value < 0n || value > UINT64_MAX) {
    throw new RangeError("Matcher event time must be a uint64 bigint");
  }
  return value;
}

function canonicalDecimalUint64(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new TypeError(`${label} must be a canonical decimal string`);
  }
  const parsed = BigInt(value);
  if (parsed > UINT64_MAX) throw new RangeError(`${label} must fit uint64`);
  return parsed;
}

export function assertMatcherAccountIdentity(
  accountValue: unknown,
  expected: ExpectedMatcherIdentity,
  expectedMakerAccountId: Hex32,
): VerifiedMatcherAccount {
  const identity = canonicalExpectedIdentity(expected);
  const makerAccountId = normalizeHex32(expectedMakerAccountId, "Expected maker account ID");
  const account = objectValue(accountValue, "Matcher account");
  assertExactKeys(
    account,
    ["ok", "makerAccountId", "configurationHash", "accountEpoch", "sequence", "checkpoint"],
    "Matcher account",
  );
  if (account.ok !== true) throw new Error("Matcher account is not available");
  if (canonicalHex32(account.makerAccountId, "Matcher maker account ID") !== makerAccountId) {
    throw new Error("Matcher account does not match the reviewed maker");
  }
  const configurationHash = canonicalHex32(account.configurationHash, "Matcher account configuration hash");
  if (configurationHash !== identity.configurationHash) {
    throw new Error("Matcher account configuration does not match the approved matcher");
  }
  const accountEpoch = canonicalDecimalUint64(account.accountEpoch, "Matcher account epoch");
  const sequence = canonicalDecimalUint64(account.sequence, "Matcher account sequence");
  const checkpointValue = objectValue(account.checkpoint, "Matcher account checkpoint");
  assertExactKeys(
    checkpointValue,
    ["version", "sequence", "recordHash", "stateRoot", "configurationHash"],
    "Matcher account checkpoint",
  );
  if (checkpointValue.version !== 1) throw new Error("Matcher account checkpoint version is unsupported");
  const checkpointSequence = canonicalDecimalUint64(checkpointValue.sequence, "Matcher checkpoint sequence");
  const checkpointConfigurationHash = canonicalHex32(
    checkpointValue.configurationHash,
    "Matcher checkpoint configuration hash",
  );
  if (checkpointSequence !== sequence || checkpointConfigurationHash !== configurationHash) {
    throw new Error("Matcher account checkpoint does not bind the account view");
  }
  return deepFreeze({
    makerAccountId,
    configurationHash,
    accountEpoch,
    sequence,
    checkpoint: {
      version: 1,
      sequence: checkpointSequence,
      recordHash: canonicalHex32(checkpointValue.recordHash, "Matcher checkpoint record hash"),
      stateRoot: canonicalHex32(checkpointValue.stateRoot, "Matcher checkpoint state root"),
      configurationHash: checkpointConfigurationHash,
    },
  });
}

function canonicalSignature(value: string): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(value)) {
    throw new TypeError("Order signature must be a 65-byte 0x-prefixed hexadecimal value");
  }
  const body = value.slice(2).toLowerCase();
  const recovery = Number.parseInt(body.slice(128), 16);
  const canonicalRecovery = recovery === 0 || recovery === 1 ? recovery + 27 : recovery;
  if (canonicalRecovery !== 27 && canonicalRecovery !== 28) {
    throw new RangeError("Order signature recovery byte must be 0, 1, 27, or 28");
  }
  return `0x${body.slice(0, 128)}${canonicalRecovery.toString(16).padStart(2, "0")}`;
}

function canonicalOrder(orderValue: TypedOrderIntent): TypedOrderIntent {
  const order = objectValue(orderValue, "Typed order intent");
  assertExactKeys(order, ORDER_KEYS, "Typed order intent");
  return {
    makerAccountId: normalizeHex32(stringValue(order.makerAccountId, "Maker account ID"), "Maker account ID"),
    authorizedSignerId: normalizeHex32(stringValue(order.authorizedSignerId, "Authorized signer ID"), "Authorized signer ID"),
    baseChainId: normalizeHex32(stringValue(order.baseChainId, "Base chain ID"), "Base chain ID"),
    baseAssetId: normalizeHex32(stringValue(order.baseAssetId, "Base asset ID"), "Base asset ID"),
    quoteChainId: normalizeHex32(stringValue(order.quoteChainId, "Quote chain ID"), "Quote chain ID"),
    quoteAssetId: normalizeHex32(stringValue(order.quoteAssetId, "Quote asset ID"), "Quote asset ID"),
    side: order.side as TypedOrderIntent["side"],
    baseAmountAtoms: order.baseAmountAtoms as bigint,
    limitPriceTicks: order.limitPriceTicks as bigint,
    nonce: order.nonce as bigint,
    accountEpoch: order.accountEpoch as bigint,
    expiry: order.expiry as bigint,
    salt: normalizeHex32(stringValue(order.salt, "Order salt"), "Order salt"),
    recipientAccountId: normalizeHex32(stringValue(order.recipientAccountId, "Recipient account ID"), "Recipient account ID"),
    timeInForce: order.timeInForce as TypedOrderIntent["timeInForce"],
    maximumFeeBps: order.maximumFeeBps as bigint,
    allowedVenues: order.allowedVenues as number,
    settlementAdapterId: normalizeHex32(stringValue(order.settlementAdapterId, "Settlement adapter ID"), "Settlement adapter ID"),
  };
}

function canonicalAccounts(value: WalletSettlementAccounts): WalletSettlementAccounts {
  const accounts = objectValue(value, "Settlement accounts");
  assertExactKeys(accounts, ["sourceAccount", "recipientAccount"], "Settlement accounts");
  return {
    sourceAccount: stringValue(accounts.sourceAccount, "Settlement source account"),
    recipientAccount: stringValue(accounts.recipientAccount, "Settlement recipient account"),
  };
}

function assertBuySideWalletAuthority(
  order: TypedOrderIntent,
  accounts: WalletSettlementAccounts,
  identity: VerifiedMatcherIdentity,
  domain: OrderDomain,
): void {
  const expectedNetwork = `eip155:${domain.chainId}`;
  if (identity.market.quote.network !== expectedNetwork) {
    throw new Error("Buy-side quote network does not match the EIP-712 signing domain");
  }
  const prefix = `${expectedNetwork}:`;
  if (!accounts.sourceAccount.startsWith(prefix)) {
    throw new Error("Buy-side source account is not on the signing network");
  }
  const address = accounts.sourceAccount.slice(prefix.length);
  const normalizedAddress = normalizeAddress(address, "Buy-side source address");
  const canonicalSourceAccount = `${prefix}${normalizedAddress}`;
  if (accounts.sourceAccount !== canonicalSourceAccount) {
    throw new Error("Buy-side source account must use its exact lowercase chain-qualified address");
  }
  const sourceWalletId = evmAuthorizedSignerId(domain.chainId, normalizedAddress);
  if (order.makerAccountId !== order.authorizedSignerId || order.makerAccountId !== sourceWalletId) {
    throw new Error("Buy-side maker and authorized signer must be the exact source wallet");
  }
}

function serializedOrder(order: TypedOrderIntent): SerializedOrderIntent {
  return {
    makerAccountId: order.makerAccountId,
    authorizedSignerId: order.authorizedSignerId,
    baseChainId: order.baseChainId,
    baseAssetId: order.baseAssetId,
    quoteChainId: order.quoteChainId,
    quoteAssetId: order.quoteAssetId,
    side: order.side,
    baseAmountAtoms: order.baseAmountAtoms.toString(),
    limitPriceTicks: order.limitPriceTicks.toString(),
    nonce: order.nonce.toString(),
    accountEpoch: order.accountEpoch.toString(),
    expiry: order.expiry.toString(),
    salt: order.salt,
    recipientAccountId: order.recipientAccountId,
    timeInForce: order.timeInForce,
    maximumFeeBps: order.maximumFeeBps.toString(),
    allowedVenues: order.allowedVenues,
    settlementAdapterId: order.settlementAdapterId,
  };
}

function prepareMatcherOrderSubmission(input: MatcherOrderSubmissionInput): PreparedSubmission {
  const identity = assertMatcherHealthIdentity(input.matcherHealth, input.expectedMatcher);
  const requestId = canonicalRequestId(input.requestId);
  const occurredAtSeconds = canonicalOccurredAtSeconds(input.occurredAtSeconds);
  const order = canonicalOrder(input.order);
  if (order.side === 1) throw new MatcherOrderClientError(MATCHER_BUY_ONLY_REASON);
  assertOrderPolicy(order, {
    nowSeconds: occurredAtSeconds,
    activeAccountEpoch: order.accountEpoch,
    pair: identity.orderPair,
    settlementAdapterId: identity.settlementAdapterId,
    requireClob: false,
  });
  const accounts = canonicalAccounts(input.accounts);
  assertSettlementAccounts(order, accounts);
  assertSettlementAccountRoles(order.side, accounts, identity.market, "Order");
  assertBuySideWalletAuthority(order, accounts, identity, input.expectedMatcher.orderDomain);
  const signature = canonicalSignature(input.signature);
  verifySignedOrderIntent(
    createEvmEoaSignatureVerifier(input.expectedMatcher.orderDomain.chainId),
    input.expectedMatcher.orderDomain,
    order,
    signature,
  );
  return {
    identity,
    requestId,
    payload: {
      version: 1,
      requestId,
      occurredAtSeconds: occurredAtSeconds.toString(),
      kind: "accept-order",
      submission: { order: serializedOrder(order), signature, accounts },
    },
  };
}

export function serializeMatcherOrderSubmission(input: MatcherOrderSubmissionInput): string {
  const prepared = prepareMatcherOrderSubmission(input);
  return JSON.stringify(prepared.payload);
}

export function buildMatcherOrderRequest(input: MatcherOrderSubmissionInput): MatcherOrderRequest {
  const prepared = prepareMatcherOrderSubmission(input);
  const body = JSON.stringify(prepared.payload);
  if (new TextEncoder().encode(body).length > MAX_MATCHER_BODY_BYTES) {
    throw new RangeError("Matcher order request exceeds the API body limit");
  }
  return deepFreeze({
    path: MATCHER_API_PATH,
    method: "POST",
    operation: MATCHER_ORDER_OPERATION,
    requestId: prepared.requestId,
    idempotencyKey: prepared.requestId,
    identity: prepared.identity,
    headers: {
      "content-type": "application/json",
      [MATCHER_IDEMPOTENCY_HEADER]: prepared.requestId,
    },
    body,
  });
}

const MATCHER_ORDER_STATUSES = new Set<VerifiedMatcherOrderReceipt["receipt"]["status"]>([
  "open",
  "filled",
  "partially-filled",
  "ioc-remainder-cancelled",
  "fok-rejected",
  "unfilled",
]);

export function assertMatcherOrderReceipt(
  value: unknown,
  expectation: MatcherOrderReceiptExpectation,
): VerifiedMatcherOrderReceipt {
  const expectedIdentity = canonicalExpectedIdentity(expectation.expectedMatcher);
  const expectedRequestId = canonicalRequestId(expectation.requestId);
  const expectedSubjectHash = normalizeHex32(expectation.subjectHash, "Expected order hash");
  const expectedOccurredAt = canonicalOccurredAtSeconds(expectation.occurredAtSeconds);
  const result = objectValue(value, "Matcher order response");
  assertExactKeys(result, ["ok", "replayed", "receipt", "checkpoint"], "Matcher order response");
  if (result.ok !== true || typeof result.replayed !== "boolean") {
    throw new Error("Matcher order response is not an accepted receipt");
  }

  const receipt = objectValue(result.receipt, "Matcher order receipt");
  assertExactKeys(
    receipt,
    ["version", "sequence", "requestId", "kind", "status", "subjectHash", "occurredAtSeconds"],
    "Matcher order receipt",
  );
  if (receipt.version !== 1 || receipt.kind !== "accept-order") {
    throw new Error("Matcher order receipt type is unsupported");
  }
  const requestId = canonicalRequestId(stringValue(receipt.requestId, "Matcher receipt request ID"));
  if (requestId !== expectedRequestId) throw new Error("Matcher receipt does not match the submitted request");
  const subjectHash = canonicalHex32(receipt.subjectHash, "Matcher receipt order hash");
  if (subjectHash !== expectedSubjectHash) throw new Error("Matcher receipt does not match the signed order");
  const occurredAtSeconds = canonicalDecimalUint64(receipt.occurredAtSeconds, "Matcher receipt event time");
  if (occurredAtSeconds !== expectedOccurredAt) throw new Error("Matcher receipt event time does not match the reviewed request");
  const status = receipt.status;
  if (typeof status !== "string" || !MATCHER_ORDER_STATUSES.has(status as VerifiedMatcherOrderReceipt["receipt"]["status"])) {
    throw new Error("Matcher order receipt status is unsupported");
  }

  const checkpoint = objectValue(result.checkpoint, "Matcher order checkpoint");
  assertExactKeys(
    checkpoint,
    ["version", "sequence", "recordHash", "stateRoot", "configurationHash"],
    "Matcher order checkpoint",
  );
  if (checkpoint.version !== 1) throw new Error("Matcher order checkpoint version is unsupported");
  const sequence = canonicalDecimalUint64(receipt.sequence, "Matcher receipt sequence");
  const checkpointSequence = canonicalDecimalUint64(checkpoint.sequence, "Matcher checkpoint sequence");
  if (checkpointSequence !== sequence) throw new Error("Matcher checkpoint does not bind the order receipt");
  const configurationHash = canonicalHex32(checkpoint.configurationHash, "Matcher checkpoint configuration hash");
  if (configurationHash !== expectedIdentity.configurationHash) {
    throw new Error("Matcher receipt checkpoint does not match the approved matcher");
  }

  return deepFreeze({
    replayed: result.replayed,
    receipt: {
      version: 1,
      sequence,
      requestId,
      kind: "accept-order",
      status: status as VerifiedMatcherOrderReceipt["receipt"]["status"],
      subjectHash,
      occurredAtSeconds,
    },
    checkpoint: {
      version: 1,
      sequence: checkpointSequence,
      recordHash: canonicalHex32(checkpoint.recordHash, "Matcher checkpoint record hash"),
      stateRoot: canonicalHex32(checkpoint.stateRoot, "Matcher checkpoint state root"),
      configurationHash,
    },
  });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}
