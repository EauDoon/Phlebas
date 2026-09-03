import {
  createAtomicSwapPlan,
  type AtomicSwapPlan,
} from "./atomic-swap-plan.ts";
import { bytesToHex, hexToBytes } from "./keccak.ts";
import {
  normalizeAddress,
  normalizeHex32,
  type HexAddress,
} from "./order-domain.ts";
import {
  deriveSwapFillId,
  validateSwapTerms,
  type SwapTermsV1,
} from "./swap-domain.ts";
import {
  ETHEREUM_MAINNET_NETWORK,
  ETHEREUM_MAINNET_USDC_ASSET,
  ETHEREUM_MAINNET_USDT_ASSET,
  NATIVE_ZEC_ASSET,
  ZCASH_MAINNET_NETWORK,
} from "./mainnet-assets.ts";
import { decodeZcashTransparentAccount } from "./zcash-address.ts";
import {
  CLTV_LOCKTIME_THRESHOLD,
  CLTV_MAX_LOCKTIME,
  buildHtlcRedeemScript,
} from "./zcash-htlc.ts";
import { hash160 } from "./zcash-transparent.ts";

type MatcherSwapTermsContext = Pick<SwapTermsV1,
  | "feeRecipient"
  | "evmEscrowContract"
  | "secretHash"
  | "authorizationDeadline"
  | "zecFundBy"
  | "evmFundBy"
  | "evmClaimSafetyCutoff"
  | "timeoutPolicyId"
  | "marketPolicyId"
  | "observerPolicyId"
  | "zecFinalityPolicyId"
  | "evmFinalityPolicyId"
>;

const MATCHER_CONTEXT_FIELDS: readonly (keyof MatcherSwapTermsContext)[] = [
  "feeRecipient",
  "evmEscrowContract",
  "secretHash",
  "authorizationDeadline",
  "zecFundBy",
  "evmFundBy",
  "evmClaimSafetyCutoff",
  "timeoutPolicyId",
  "marketPolicyId",
  "observerPolicyId",
  "zecFinalityPolicyId",
  "evmFinalityPolicyId",
];

function assertContext(context: MatcherSwapTermsContext): void {
  for (const field of MATCHER_CONTEXT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(context, field) || context[field] === undefined) {
      throw new TypeError(`Matcher terms context requires ${field}`);
    }
  }
}

function zcashP2pkhHash(account: string, environment: "mainnet" | "testnet", label: string): `0x${string}` {
  const decoded = decodeZcashTransparentAccount(account);
  if (decoded.environment !== environment) throw new Error(`${label} is on the wrong Zcash network`);
  if (decoded.kind !== "p2pkh") throw new Error(`${label} must be a transparent P2PKH account`);
  return `0x${bytesToHex(decoded.payload)}` as `0x${string}`;
}

function evmAddress(account: string, network: string, label: string): HexAddress {
  const prefix = `${network}:`;
  if (!account.startsWith(prefix)) throw new Error(`${label} must be an EVM account on ${network}`);
  return normalizeAddress(account.slice(prefix.length), label);
}

function assertExactMainnetPlan(
  plan: AtomicSwapPlan,
  input: Parameters<typeof createAtomicSwapPlan>[0],
): void {
  if (input.policy.pair.base.environment !== "mainnet" || input.policy.pair.quote.environment !== "mainnet") {
    throw new Error("Matcher terms require Mainnet settlement account environments");
  }
  if (plan.zcashLeg.network !== ZCASH_MAINNET_NETWORK || plan.zcashLeg.asset !== NATIVE_ZEC_ASSET
    || plan.zcashLeg.decimals !== 8) {
    throw new Error("Matcher terms require exact Zcash Mainnet native ZEC");
  }
  if (plan.stablecoinLeg.network !== ETHEREUM_MAINNET_NETWORK
    || (plan.stablecoinLeg.asset !== ETHEREUM_MAINNET_USDC_ASSET
      && plan.stablecoinLeg.asset !== ETHEREUM_MAINNET_USDT_ASSET)
    || plan.stablecoinLeg.decimals !== 6) {
    throw new Error("Matcher terms require exact Ethereum Mainnet USDC or USDT");
  }
}

function assertStrictDeadlines(
  input: Parameters<typeof createAtomicSwapPlan>[0],
  context: MatcherSwapTermsContext,
  evmRefundTime: bigint,
  zecRefundTime: bigint,
): void {
  const deadlines = [
    context.authorizationDeadline,
    context.zecFundBy,
    context.evmFundBy,
    context.evmClaimSafetyCutoff,
    evmRefundTime,
    zecRefundTime,
  ];
  if (deadlines.some((value) => typeof value !== "bigint" || value <= 0n)) {
    throw new TypeError("Matcher terms deadlines must be positive bigint values");
  }
  if (context.authorizationDeadline <= input.acceptedAtSeconds) {
    throw new RangeError("Matcher terms authorization deadline must be after match acceptance");
  }
  if (deadlines.some((deadline, index) => index > 0 && deadline <= deadlines[index - 1]!)) {
    throw new RangeError("Matcher terms deadlines must be strictly increasing");
  }
}

function deriveZcashLockScriptHash(
  secretHash: string,
  claimPubKeyHash: `0x${string}`,
  refundPubKeyHash: `0x${string}`,
  refundTime: bigint,
): `0x${string}` {
  if (refundTime < BigInt(CLTV_LOCKTIME_THRESHOLD) || refundTime > BigInt(CLTV_MAX_LOCKTIME)) {
    throw new RangeError("Matcher terms Zcash refund time must fit timestamp CLTV");
  }
  const redeemScript = buildHtlcRedeemScript({
    digest: hexToBytes(secretHash),
    claimPkh: hexToBytes(claimPubKeyHash),
    refundPkh: hexToBytes(refundPubKeyHash),
    lock: { type: "timestamp", value: Number(refundTime) },
  });
  return `0x${bytesToHex(hash160(redeemScript))}` as `0x${string}`;
}

/**
 * Materialize one canonical, unsigned terms object from a matched no-value plan.
 * Participant signatures and wallet leg authorizations remain outside this adapter.
 */
export function materializeMatcherSwapTerms(
  input: Parameters<typeof createAtomicSwapPlan>[0],
  context: MatcherSwapTermsContext,
): SwapTermsV1 {
  assertContext(context);
  const plan = createAtomicSwapPlan(input);
  if (plan.venue !== "order-book") throw new Error("Matcher terms initially support order-book fills only");
  assertExactMainnetPlan(plan, input);
  const quoteAmountAtoms = BigInt(plan.grossQuoteAtoms);

  const zecSeller = input.taker.order.side === 1 ? input.taker : input.counterparty;
  const stablecoinSeller = input.taker.order.side === 0 ? input.taker : input.counterparty;
  const zecOrderHash = normalizeHex32(zecSeller.orderHash, "ZEC order hash");
  const stablecoinOrderHash = normalizeHex32(stablecoinSeller.orderHash, "Stablecoin order hash");
  const zecSellerId = normalizeHex32(zecSeller.order.makerAccountId, "ZEC seller ID");
  const stablecoinSellerId = normalizeHex32(stablecoinSeller.order.makerAccountId, "Stablecoin seller ID");

  const maximumFeeBps = zecSeller.order.maximumFeeBps < stablecoinSeller.order.maximumFeeBps
    ? zecSeller.order.maximumFeeBps : stablecoinSeller.order.maximumFeeBps;

  const evmFunder = evmAddress(plan.stablecoinLeg.funder, ETHEREUM_MAINNET_NETWORK, "EVM funder");
  const evmClaimRecipient = evmAddress(plan.stablecoinLeg.claimant, ETHEREUM_MAINNET_NETWORK, "EVM claim recipient");
  const evmRefundRecipient = evmAddress(plan.stablecoinLeg.refundAccount, ETHEREUM_MAINNET_NETWORK, "EVM refund recipient");
  const claimPubKeyHash = zcashP2pkhHash(
    plan.zcashLeg.claimant,
    input.policy.pair.base.environment,
    "Zcash claim recipient",
  );
  const refundPubKeyHash = zcashP2pkhHash(
    plan.zcashLeg.refundAccount,
    input.policy.pair.base.environment,
    "Zcash refund account",
  );
  const evmRefundTime = BigInt(plan.stablecoinLeg.refundLock.valueSeconds);
  const zecRefundTime = BigInt(plan.zcashLeg.refundLock.valueSeconds);
  assertStrictDeadlines(input, context, evmRefundTime, zecRefundTime);

  const terms: SwapTermsV1 = {
    version: 1,
    fillId: deriveSwapFillId({
      zecOrderHash,
      stablecoinOrderHash,
      fillIndex: BigInt(plan.fillIndex),
      zecAmountZatoshis: BigInt(plan.baseAmountAtoms),
      quoteAmountAtoms,
      executionPriceTicks: BigInt(plan.executionPriceTicks),
    }),
    fillIndex: BigInt(plan.fillIndex),
    zecOrderHash,
    stablecoinOrderHash,
    zecSellerId,
    stablecoinSellerId,
    zecChain: plan.zcashLeg.network,
    zecAsset: plan.zcashLeg.asset,
    quoteChain: plan.stablecoinLeg.network,
    quoteAsset: plan.stablecoinLeg.asset,
    zecAmountZatoshis: BigInt(plan.baseAmountAtoms),
    quoteAmountAtoms,
    executionPriceTicks: BigInt(plan.executionPriceTicks),
    protocolFeeQuoteAtoms: 0n,
    feeRecipient: context.feeRecipient,
    maximumFeeBps,
    zcashLockScriptHash: deriveZcashLockScriptHash(
      context.secretHash,
      claimPubKeyHash,
      refundPubKeyHash,
      zecRefundTime,
    ),
    zcashClaimPubKeyHash: claimPubKeyHash,
    zcashRefundPubKeyHash: refundPubKeyHash,
    evmFunder,
    evmClaimRecipient,
    evmRefundRecipient,
    evmEscrowContract: context.evmEscrowContract,
    secretHash: context.secretHash,
    authorizationDeadline: context.authorizationDeadline,
    zecFundBy: context.zecFundBy,
    evmFundBy: context.evmFundBy,
    evmClaimSafetyCutoff: context.evmClaimSafetyCutoff,
    evmRefundTime,
    zecRefundTime,
    timeoutPolicyId: context.timeoutPolicyId,
    marketPolicyId: context.marketPolicyId,
    observerPolicyId: context.observerPolicyId,
    zecFinalityPolicyId: context.zecFinalityPolicyId,
    evmFinalityPolicyId: context.evmFinalityPolicyId,
  };

  // The canonical validator performs the final identity, amount, fee, and fill binding checks.
  // It also freezes the returned object. Terms are deliberately unsigned and contain no wallet action.
  return validateSwapTerms(terms);
}
