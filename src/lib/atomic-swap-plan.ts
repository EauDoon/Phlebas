import { hashTypedOrder, type OrderDomain, type TypedOrderIntent } from "./eip712-order.ts";
import { keccak256Text } from "./keccak.ts";
import {
  UINT64_MAX,
  accountIdentifier,
  adapterIdentifier,
  assetIdentifier,
  chainIdentifier,
  normalizeHex32,
  type Hex32,
} from "./order-domain.ts";

export const ATOMIC_SWAP_PLAN_VERSION = 1;
export const NO_VALUE_SWAP_GATES = [
  "approved-current-zcash-transaction-template",
  "approved-stablecoin-escrow-contract",
  "current-chain-and-finality-evidence",
  "wallet-leg-authorizations",
  "legal-release-approval",
  "explicit-transaction-authorization",
] as const;

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
  hashlockDigest: Hex32;
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
  takerOrderHash: Hex32;
  counterpartyOrderHash: Hex32;
  executionPriceTicks: string;
  baseAmountAtoms: string;
  quoteTransferAtoms: string;
  hashlockDigest: Hex32;
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
    value.hashlockDigest,
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
    `takerOrderHash=${plan.takerOrderHash}`,
    `counterpartyOrderHash=${plan.counterpartyOrderHash}`,
    `executionPriceTicks=${plan.executionPriceTicks}`,
    `baseAmountAtoms=${plan.baseAmountAtoms}`,
    `quoteTransferAtoms=${plan.quoteTransferAtoms}`,
    `hashlockDigest=${plan.hashlockDigest}`,
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
  taker: AtomicSwapParty;
  counterparty: AtomicSwapParty;
  acceptedAtSeconds: bigint;
  executionPriceTicks: bigint;
  baseAmountAtoms: bigint;
  quoteTransferAtoms: bigint;
  policy: AtomicSwapPolicy;
}): AtomicSwapPlan {
  assertPolicy(input.policy);
  if (typeof input.acceptedAtSeconds !== "bigint" || input.acceptedAtSeconds < 500_000_000n || input.acceptedAtSeconds > UINT64_MAX) {
    throw new RangeError("Accepted time must be a timestamp-style uint64 for absolute CLTV planning");
  }
  if (typeof input.executionPriceTicks !== "bigint" || input.executionPriceTicks <= 0n) {
    throw new RangeError("Execution price must be positive");
  }
  if (typeof input.baseAmountAtoms !== "bigint" || input.baseAmountAtoms <= 0n) throw new RangeError("Base amount must be positive");
  if (typeof input.quoteTransferAtoms !== "bigint" || input.quoteTransferAtoms <= 0n) throw new RangeError("Quote transfer must be positive");
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
  const hashlockDigest = normalizeHex32(input.taker.order.salt, "Swap hashlock digest");
  if (hashlockDigest === `0x${"00".repeat(32)}`) throw new Error("Swap hashlock digest cannot be zero");

  const buyer = input.taker.order.side === 0 ? input.taker : input.counterparty;
  const seller = input.taker.order.side === 1 ? input.taker : input.counterparty;
  const stablecoinRefund = input.acceptedAtSeconds + input.policy.stablecoinRefundDelaySeconds;
  const zcashRefund = stablecoinRefund + input.policy.zcashRefundSafetyDeltaSeconds;
  if (zcashRefund > UINT64_MAX) throw new RangeError("Atomic-swap refund time exceeds uint64");

  const common = {
    hashAlgorithm: "sha256" as const,
    hashlockDigest,
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
    amountAtoms: input.quoteTransferAtoms.toString(),
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
    takerOrderHash,
    counterpartyOrderHash,
    executionPriceTicks: input.executionPriceTicks.toString(),
    baseAmountAtoms: input.baseAmountAtoms.toString(),
    quoteTransferAtoms: input.quoteTransferAtoms.toString(),
    hashlockDigest,
    stablecoinLeg,
    zcashLeg,
    deadlineOrdering: "stablecoin-refund-before-zcash-refund",
    platformRetainedBaseAtoms: "0",
    platformRetainedQuoteAtoms: "0",
    unilateralSpendingAuthority: false,
    execution: { mode: "no-value", status: "blocked", blockingGates: NO_VALUE_SWAP_GATES },
  };
  return { ...withoutId, planId: keccak256Text(planPayload(withoutId)) };
}
