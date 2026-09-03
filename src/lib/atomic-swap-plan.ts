import { hashTypedOrder, type OrderDomain, type TypedOrderIntent } from "./eip712-order.ts";
import { keccak256Text } from "./keccak.ts";
import { KNOWN_VENUES, VENUE_CLOB, VENUE_SOLVER } from "./order-policy.ts";
import { assertZcashTransparentAccount, assertZcashTransparentP2pkhAccount } from "./zcash-address.ts";
import {
  UINT64_MAX,
  UINT256_MAX,
  accountIdentifier,
  adapterIdentifier,
  assetIdentifier,
  chainIdentifier,
  normalizeHex32,
  type Hex32,
} from "./order-domain.ts";

export const ATOMIC_SWAP_PLAN_VERSION = 1;
export const NO_VALUE_SWAP_GATES = Object.freeze([
  "approved-current-zcash-transaction-template",
  "approved-stablecoin-escrow-contract",
  "current-chain-and-finality-evidence",
  "wallet-leg-authorizations",
  "per-fill-shared-hashlock-authorization",
  "legal-release-approval",
  "explicit-transaction-authorization",
] as const);

export const HASHLOCK_STATUS = "unresolved-wallet-authorization" as const;

export type ExactAsset = Readonly<{
  network: string;
  asset: string;
  environment: "testnet" | "mainnet";
  decimals: number;
}>;

export type AtomicSwapPair = Readonly<{
  base: ExactAsset;
  quote: ExactAsset;
}>;

export type WalletSettlementAccounts = Readonly<{
  sourceAccount: string;
  recipientAccount: string;
}>;

export type AtomicSwapParty = Readonly<{
  orderHash: Hex32;
  order: TypedOrderIntent;
  accounts: WalletSettlementAccounts;
  authorizationKind?: "order" | "solver-quote";
  verifiedAuthorizationHash?: Hex32;
}>;

export type AtomicSwapPolicy = Readonly<{
  orderDomain: OrderDomain;
  pair: AtomicSwapPair;
  settlementProtocolVersion: string;
  stablecoinRefundDelaySeconds: bigint;
  zcashRefundSafetyDeltaSeconds: bigint;
  zcashRequiredConfirmations: number;
  quoteRequiredConfirmations: number;
}>;

export type AtomicSwapLeg = Readonly<{
  assetRole: "native-zec" | "stablecoin";
  network: string;
  asset: string;
  decimals: number;
  amountAtoms: string;
  funder: string;
  claimant: string;
  refundAccount: string;
  hashAlgorithm: "sha256";
  hashlockStatus: typeof HASHLOCK_STATUS;
  hashlockDigest: Hex32 | null;
  hashlockCommitmentRequestId: Hex32;
  refundLock: Readonly<{
    mode: "absolute-time";
    valueSeconds: string;
  }>;
  requiredConfirmations: number;
  finalityRequirement: "confirmed-zcash-block" | "l1-posted-and-confirmed";
  transactionTemplate: "unresolved-no-value";
  walletAuthorization: "required";
  broadcast: "disabled";
}>;

export type AtomicSwapPlan = Readonly<{
  version: typeof ATOMIC_SWAP_PLAN_VERSION;
  planId: Hex32;
  settlementProtocolVersion: string;
  venue: "order-book" | "solver";
  fillIndex: number;
  takerOrderHash: Hex32;
  counterpartyOrderHash: Hex32;
  executionPriceTicks: string;
  baseAmountAtoms: string;
  grossQuoteAtoms: string;
  feeBps: string;
  feeQuoteAtoms: string;
  quoteTransferAtoms: string;
  hashlockStatus: typeof HASHLOCK_STATUS;
  hashlockDigest: Hex32 | null;
  hashlockCommitmentRequestId: Hex32;
  stablecoinLeg: AtomicSwapLeg;
  zcashLeg: AtomicSwapLeg;
  deadlineOrdering: "stablecoin-refund-before-zcash-refund";
  platformRetainedBaseAtoms: "0";
  platformRetainedQuoteAtoms: "0";
  unilateralSpendingAuthority: false;
  execution: Readonly<{
    mode: "no-value";
    status: "blocked";
    blockingGates: typeof NO_VALUE_SWAP_GATES;
  }>;
}>;

function assertExactAsset(asset: ExactAsset, role: string): void {
  if (chainIdentifier(asset.network) === (`0x${"00".repeat(32)}` as Hex32)) throw new Error(`${role} network is invalid`);
  if (assetIdentifier(asset.asset) === (`0x${"00".repeat(32)}` as Hex32)) throw new Error(`${role} asset is invalid`);
  if (!asset.asset.startsWith(`${asset.network}/`)) throw new Error(`${role} asset is not on its declared network`);
  if (!Number.isSafeInteger(asset.decimals) || asset.decimals < 0 || asset.decimals > 255) {
    throw new RangeError(`${role} decimals must be an integer from 0 to 255`);
  }
}

function assertPositiveUint64(value: bigint, label: string): void {
  if (typeof value !== "bigint" || value <= 0n || value > UINT64_MAX) throw new RangeError(`${label} must be a positive uint64`);
}

function assertConfirmations(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 10_000) {
    throw new RangeError(`${label} must be a positive bounded integer`);
  }
}

function divideUp(numerator: bigint, denominator: bigint): bigint {
  if (numerator === 0n) return 0n;
  return ((numerator - 1n) / denominator) + 1n;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

function quoteForFill(baseAmountAtoms: bigint, executionPriceTicks: bigint, sellerSide: boolean): bigint {
  const numerator = baseAmountAtoms * executionPriceTicks;
  return sellerSide ? divideUp(numerator, 10_000n) : numerator / 10_000n;
}

function assertEvmAccount(account: string, network: string, label: string): void {
  if (!/^eip155:[1-9][0-9]*$/.test(network)
    || !account.startsWith(`${network}:`)
    || !/^0x[0-9a-fA-F]{40}$/.test(account.slice(network.length + 1))) {
    throw new Error(`${label} must be an EVM account on the exact ${network} network`);
  }
}

export function assertSettlementAccountRoles(
  side: TypedOrderIntent["side"],
  accounts: WalletSettlementAccounts,
  pair: AtomicSwapPair,
  label: string,
): void {
  if (side === 0) {
    assertEvmAccount(accounts.sourceAccount, pair.quote.network, `${label} buyer source account`);
    assertZcashTransparentP2pkhAccount(
      accounts.recipientAccount,
      pair.base.environment,
      `${label} buyer recipient account`,
    );
  } else {
    assertZcashTransparentAccount(accounts.sourceAccount, pair.base.environment, `${label} seller source account`);
    assertEvmAccount(accounts.recipientAccount, pair.quote.network, `${label} seller recipient account`);
  }
}

function assertQuoteLimits(
  baseAmountAtoms: bigint,
  executionPriceTicks: bigint,
  quoteTransferAtoms: bigint,
  buyer: AtomicSwapParty,
  seller: AtomicSwapParty,
): void {
  const minimumForSeller = divideUp(baseAmountAtoms * seller.order.limitPriceTicks, 10_000n);
  const maximumForBuyer = (baseAmountAtoms * buyer.order.limitPriceTicks) / 10_000n;
  if (minimumForSeller > maximumForBuyer
    || quoteTransferAtoms < minimumForSeller
    || quoteTransferAtoms > maximumForBuyer) {
    throw new Error("Atomic-swap quote rounding cannot preserve both signed limits");
  }
  if (executionPriceTicks <= 0n) throw new RangeError("Execution price must be positive");
}

export function assertSettlementAccounts(order: TypedOrderIntent, accounts: WalletSettlementAccounts): void {
  if (accountIdentifier(accounts.sourceAccount) !== normalizeHex32(order.makerAccountId, "Maker account ID")) {
    throw new Error("Settlement source account does not match the signed maker account ID");
  }
  if (accountIdentifier(accounts.recipientAccount) !== normalizeHex32(order.recipientAccountId, "Recipient account ID")) {
    throw new Error("Settlement recipient account does not match the signed recipient account ID");
  }
}

function assertPair(order: TypedOrderIntent, pair: AtomicSwapPair): void {
  if (normalizeHex32(order.baseChainId, "Base chain ID") !== chainIdentifier(pair.base.network)
    || normalizeHex32(order.baseAssetId, "Base asset ID") !== assetIdentifier(pair.base.asset)
    || normalizeHex32(order.quoteChainId, "Quote chain ID") !== chainIdentifier(pair.quote.network)
    || normalizeHex32(order.quoteAssetId, "Quote asset ID") !== assetIdentifier(pair.quote.asset)) {
    throw new Error("Order does not bind the exact atomic-swap asset pair");
  }
}

function assertPolicy(policy: AtomicSwapPolicy): void {
  assertExactAsset(policy.pair.base, "Base");
  assertExactAsset(policy.pair.quote, "Quote");
  if (policy.pair.base.decimals !== 8) throw new Error("Native ZEC plans require 8-decimal zatoshi accounting");
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(policy.settlementProtocolVersion)) {
    throw new TypeError("Settlement protocol version is invalid");
  }
  assertPositiveUint64(policy.stablecoinRefundDelaySeconds, "Stablecoin refund delay");
  assertPositiveUint64(policy.zcashRefundSafetyDeltaSeconds, "Zcash refund safety delta");
  assertConfirmations(policy.zcashRequiredConfirmations, "Zcash confirmations");
  assertConfirmations(policy.quoteRequiredConfirmations, "Quote confirmations");
}

function planPayload(plan: Omit<AtomicSwapPlan, "planId">): string {
  const leg = (value: AtomicSwapLeg) => [
    value.assetRole,
    value.network,
    value.asset,
    value.decimals,
    value.amountAtoms,
    value.funder,
    value.claimant,
    value.refundAccount,
    value.hashAlgorithm,
    value.hashlockStatus,
    value.hashlockDigest,
    value.hashlockCommitmentRequestId,
    value.refundLock.mode,
    value.refundLock.valueSeconds,
    value.requiredConfirmations,
    value.finalityRequirement,
    value.transactionTemplate,
    value.walletAuthorization,
    value.broadcast,
  ].join(":");
  return [
    "PhlebasAtomicSwapPlan",
    `version=${plan.version}`,
    `protocol=${plan.settlementProtocolVersion}`,
    `venue=${plan.venue}`,
    `fillIndex=${plan.fillIndex}`,
    `takerOrderHash=${plan.takerOrderHash}`,
    `counterpartyOrderHash=${plan.counterpartyOrderHash}`,
    `executionPriceTicks=${plan.executionPriceTicks}`,
    `baseAmountAtoms=${plan.baseAmountAtoms}`,
    `grossQuoteAtoms=${plan.grossQuoteAtoms}`,
    `feeBps=${plan.feeBps}`,
    `feeQuoteAtoms=${plan.feeQuoteAtoms}`,
    `quoteTransferAtoms=${plan.quoteTransferAtoms}`,
    `hashlockStatus=${plan.hashlockStatus}`,
    `hashlockDigest=${plan.hashlockDigest}`,
    `hashlockCommitmentRequestId=${plan.hashlockCommitmentRequestId}`,
    `stablecoin=${leg(plan.stablecoinLeg)}`,
    `zcash=${leg(plan.zcashLeg)}`,
    `deadlineOrdering=${plan.deadlineOrdering}`,
    `platformRetainedBaseAtoms=${plan.platformRetainedBaseAtoms}`,
    `platformRetainedQuoteAtoms=${plan.platformRetainedQuoteAtoms}`,
    `unilateralSpendingAuthority=${plan.unilateralSpendingAuthority}`,
    `execution=${plan.execution.mode}:${plan.execution.status}:${plan.execution.blockingGates.join(",")}`,
  ].join("\n");
}

export function createAtomicSwapPlan(input: {
  venue: AtomicSwapPlan["venue"];
  fillIndex: number;
  taker: AtomicSwapParty;
  counterparty: AtomicSwapParty;
  acceptedAtSeconds: bigint;
  executionPriceTicks: bigint;
  baseAmountAtoms: bigint;
  feeBps: bigint;
  policy: AtomicSwapPolicy;
}): AtomicSwapPlan {
  assertPolicy(input.policy);
  if (input.venue !== "order-book" && input.venue !== "solver") throw new Error("Unknown atomic-swap venue");
  const requiredVenue = input.venue === "order-book" ? VENUE_CLOB : VENUE_SOLVER;
  for (const party of [input.taker, input.counterparty]) {
    const venues = party.order.allowedVenues;
    if (!Number.isInteger(venues) || venues < 1 || venues > KNOWN_VENUES || (venues & requiredVenue) === 0) {
      throw new Error("Atomic-swap party does not authorize the selected venue");
    }
  }
  if (input.venue !== "solver" && input.counterparty.authorizationKind === "solver-quote") {
    throw new Error("Solver quote authorization requires the solver venue");
  }
  if (!Number.isSafeInteger(input.fillIndex) || input.fillIndex < 0 || input.fillIndex > 127) {
    throw new RangeError("Fill index must be an integer from 0 to 127");
  }
  if (typeof input.acceptedAtSeconds !== "bigint" || input.acceptedAtSeconds < 500_000_000n || input.acceptedAtSeconds > UINT64_MAX) {
    throw new RangeError("Accepted time must be a timestamp-style uint64 for absolute CLTV planning");
  }
  if (typeof input.executionPriceTicks !== "bigint" || input.executionPriceTicks <= 0n) {
    throw new RangeError("Execution price must be positive");
  }
  if (input.executionPriceTicks > UINT256_MAX) throw new RangeError("Execution price must fit uint256");
  if (typeof input.baseAmountAtoms !== "bigint" || input.baseAmountAtoms <= 0n) throw new RangeError("Base amount must be positive");
  if (input.baseAmountAtoms > UINT256_MAX) throw new RangeError("Base amount must fit uint256");
  if (input.feeBps !== 0n) {
    throw new RangeError("Atomic swap plan requires a zero protocol fee");
  }
  if (input.taker.order.side === input.counterparty.order.side) throw new Error("Atomic-swap parties must be on opposite sides");
  assertPair(input.taker.order, input.policy.pair);
  assertPair(input.counterparty.order, input.policy.pair);
  const expectedAdapter = adapterIdentifier(input.policy.settlementProtocolVersion);
  if (normalizeHex32(input.taker.order.settlementAdapterId, "Taker settlement adapter ID") !== expectedAdapter
    || normalizeHex32(input.counterparty.order.settlementAdapterId, "Counterparty settlement adapter ID") !== expectedAdapter) {
    throw new Error("Atomic-swap parties do not authorize the configured settlement protocol");
  }
  assertSettlementAccounts(input.taker.order, input.taker.accounts);
  assertSettlementAccounts(input.counterparty.order, input.counterparty.accounts);
  assertSettlementAccountRoles(input.taker.order.side, input.taker.accounts, input.policy.pair, "Taker");
  assertSettlementAccountRoles(input.counterparty.order.side, input.counterparty.accounts, input.policy.pair, "Counterparty");
  const takerOrderHash = normalizeHex32(input.taker.orderHash, "Taker order hash");
  const counterpartyOrderHash = normalizeHex32(input.counterparty.orderHash, "Counterparty order hash");
  if (takerOrderHash === counterpartyOrderHash) throw new Error("Atomic-swap parties must use distinct orders");
  if ((input.taker.authorizationKind ?? "order") !== "order"
    || hashTypedOrder(input.policy.orderDomain, input.taker.order) !== takerOrderHash) {
    throw new Error("Taker order hash does not bind its signed order body");
  }
  const counterpartyAuthorizationMatches = input.counterparty.authorizationKind === "solver-quote"
    ? normalizeHex32(input.counterparty.verifiedAuthorizationHash ?? "", "Verified solver quote hash") === counterpartyOrderHash
    : hashTypedOrder(input.policy.orderDomain, input.counterparty.order) === counterpartyOrderHash;
  if (!counterpartyAuthorizationMatches) {
    throw new Error("Counterparty order hash does not bind its signed order body");
  }
  if (input.taker.order.expiry <= input.acceptedAtSeconds || input.counterparty.order.expiry <= input.acceptedAtSeconds) {
    throw new Error("Atomic-swap party order is expired");
  }
  if (input.baseAmountAtoms > input.taker.order.baseAmountAtoms || input.baseAmountAtoms > input.counterparty.order.baseAmountAtoms) {
    throw new Error("Atomic-swap fill exceeds a signed order amount");
  }
  if ((input.taker.order.side === 0 && input.executionPriceTicks > input.taker.order.limitPriceTicks)
    || (input.taker.order.side === 1 && input.executionPriceTicks < input.taker.order.limitPriceTicks)
    || (input.counterparty.order.side === 0 && input.executionPriceTicks > input.counterparty.order.limitPriceTicks)
    || (input.counterparty.order.side === 1 && input.executionPriceTicks < input.counterparty.order.limitPriceTicks)) {
    throw new Error("Atomic-swap execution price violates a signed limit");
  }

  const buyer = input.taker.order.side === 0 ? input.taker : input.counterparty;
  const seller = input.taker.order.side === 1 ? input.taker : input.counterparty;
  const grossQuoteAtoms = quoteForFill(
    input.baseAmountAtoms,
    input.executionPriceTicks,
    input.counterparty.order.side === 1,
  );
  if (grossQuoteAtoms <= 0n) throw new Error("Quote amount is dust");
  const feeQuoteAtoms = 0n;
  const quoteTransferAtoms = grossQuoteAtoms;
  if (grossQuoteAtoms > UINT256_MAX || feeQuoteAtoms > UINT256_MAX || quoteTransferAtoms <= 0n || quoteTransferAtoms > UINT256_MAX) {
    throw new RangeError("Quote settlement amount is outside uint256 or is dust");
  }
  assertQuoteLimits(input.baseAmountAtoms, input.executionPriceTicks, quoteTransferAtoms, buyer, seller);
  const hashlockStatus = HASHLOCK_STATUS;
  const hashlockDigest = null;
  const hashlockCommitmentRequestId = keccak256Text([
    "PhlebasHashlockCommitmentRequest",
    "version=1",
    `venue=${input.venue}`,
    `fillIndex=${input.fillIndex}`,
    `takerOrderHash=${takerOrderHash}`,
    `counterpartyOrderHash=${counterpartyOrderHash}`,
    `executionPriceTicks=${input.executionPriceTicks}`,
    `baseAmountAtoms=${input.baseAmountAtoms}`,
    `grossQuoteAtoms=${grossQuoteAtoms}`,
    `feeBps=${input.feeBps}`,
    `feeQuoteAtoms=${feeQuoteAtoms}`,
    `quoteTransferAtoms=${quoteTransferAtoms}`,
  ].join("\n"));
  const stablecoinRefund = input.acceptedAtSeconds + input.policy.stablecoinRefundDelaySeconds;
  const zcashRefund = stablecoinRefund + input.policy.zcashRefundSafetyDeltaSeconds;
  if (zcashRefund > UINT64_MAX) throw new RangeError("Atomic-swap refund time exceeds uint64");

  const common = {
    hashAlgorithm: "sha256" as const,
    hashlockStatus,
    hashlockDigest,
    hashlockCommitmentRequestId,
    walletAuthorization: "required" as const,
    broadcast: "disabled" as const,
    transactionTemplate: "unresolved-no-value" as const,
  };
  const stablecoinLeg: AtomicSwapLeg = {
    ...common,
    assetRole: "stablecoin",
    network: input.policy.pair.quote.network,
    asset: input.policy.pair.quote.asset,
    decimals: input.policy.pair.quote.decimals,
    amountAtoms: quoteTransferAtoms.toString(),
    funder: buyer.accounts.sourceAccount,
    claimant: seller.accounts.recipientAccount,
    refundAccount: buyer.accounts.sourceAccount,
    refundLock: { mode: "absolute-time", valueSeconds: stablecoinRefund.toString() },
    requiredConfirmations: input.policy.quoteRequiredConfirmations,
    finalityRequirement: "l1-posted-and-confirmed",
  };
  const zcashLeg: AtomicSwapLeg = {
    ...common,
    assetRole: "native-zec",
    network: input.policy.pair.base.network,
    asset: input.policy.pair.base.asset,
    decimals: input.policy.pair.base.decimals,
    amountAtoms: input.baseAmountAtoms.toString(),
    funder: seller.accounts.sourceAccount,
    claimant: buyer.accounts.recipientAccount,
    refundAccount: seller.accounts.sourceAccount,
    refundLock: { mode: "absolute-time", valueSeconds: zcashRefund.toString() },
    requiredConfirmations: input.policy.zcashRequiredConfirmations,
    finalityRequirement: "confirmed-zcash-block",
  };
  const withoutId: Omit<AtomicSwapPlan, "planId"> = {
    version: ATOMIC_SWAP_PLAN_VERSION,
    settlementProtocolVersion: input.policy.settlementProtocolVersion,
    venue: input.venue,
    fillIndex: input.fillIndex,
    takerOrderHash,
    counterpartyOrderHash,
    executionPriceTicks: input.executionPriceTicks.toString(),
    baseAmountAtoms: input.baseAmountAtoms.toString(),
    grossQuoteAtoms: grossQuoteAtoms.toString(),
    feeBps: input.feeBps.toString(),
    feeQuoteAtoms: feeQuoteAtoms.toString(),
    quoteTransferAtoms: quoteTransferAtoms.toString(),
    hashlockStatus,
    hashlockDigest,
    hashlockCommitmentRequestId,
    stablecoinLeg,
    zcashLeg,
    deadlineOrdering: "stablecoin-refund-before-zcash-refund",
    platformRetainedBaseAtoms: "0",
    platformRetainedQuoteAtoms: "0",
    unilateralSpendingAuthority: false,
    execution: { mode: "no-value", status: "blocked", blockingGates: NO_VALUE_SWAP_GATES },
  };
  return deepFreeze({ ...withoutId, planId: keccak256Text(planPayload(withoutId)) });
}
