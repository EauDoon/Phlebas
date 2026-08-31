import { UINT64_MAX, normalizeAddress, normalizeHex32, type Hex32, type HexAddress } from "./order-domain.ts";
import { sha256Hex } from "./sha256.ts";

export const SWAP_TERMS_VERSION = 1 as const;
export const MAX_SWAP_FEE_BPS = 30n;
export const SWAP_QUOTE_COST_DIVISOR = 10_000n;

export type SwapRole = "zec-seller" | "stablecoin-seller";

export type SwapMarketIdentity = Readonly<{
  zecChain: string;
  zecAsset: string;
  quoteChain: string;
  quoteAsset: string;
}>;

export type SwapMarketPolicyV1 = Readonly<{
  version: 1;
  markets: readonly SwapMarketIdentity[];
}>;

export type SwapTermsV1 = Readonly<{
  version: typeof SWAP_TERMS_VERSION;
  fillId: Hex32;
  fillIndex: bigint;
  zecOrderHash: Hex32;
  stablecoinOrderHash: Hex32;
  zecSellerId: Hex32;
  stablecoinSellerId: Hex32;
  zecChain: string;
  zecAsset: string;
  quoteChain: string;
  quoteAsset: string;
  zecAmountZatoshis: bigint;
  quoteAmountAtoms: bigint;
  executionPriceTicks: bigint;
  protocolFeeQuoteAtoms: bigint;
  feeRecipient: HexAddress;
  maximumFeeBps: bigint;
  zcashLockScriptHash: `0x${string}`;
  zcashClaimPubKeyHash: `0x${string}`;
  zcashRefundPubKeyHash: `0x${string}`;
  evmFunder: HexAddress;
  evmClaimRecipient: HexAddress;
  evmRefundRecipient: HexAddress;
  evmEscrowContract: HexAddress;
  secretHash: Hex32;
  authorizationDeadline: bigint;
  zecFundBy: bigint;
  evmFundBy: bigint;
  evmClaimSafetyCutoff: bigint;
  evmRefundTime: bigint;
  zecRefundTime: bigint;
  timeoutPolicyId: Hex32;
  marketPolicyId: Hex32;
  observerPolicyId: Hex32;
  zecFinalityPolicyId: Hex32;
  evmFinalityPolicyId: Hex32;
}>;

const BIP122_CHAIN = /^bip122:[0-9a-f]{32}$/;
const EIP155_CHAIN = /^eip155:(0|[1-9][0-9]{0,19})$/;
const EIP155_ERC20_ASSET = /^eip155:(0|[1-9][0-9]{0,19})\/erc20:0x[0-9a-f]{40}$/;

function canonicalHex32(value: string, label: string): Hex32 {
  const normalized = normalizeHex32(value, label);
  if (value !== normalized) throw new TypeError(`${label} must be lowercase canonical hexadecimal`);
  if (normalized === `0x${"00".repeat(32)}`) throw new TypeError(`${label} cannot be zero`);
  return normalized;
}

function canonicalAddress(value: string, label: string): HexAddress {
  const normalized = normalizeAddress(value, label);
  if (value !== normalized) throw new TypeError(`${label} must be lowercase canonical hexadecimal`);
  if (normalized === `0x${"00".repeat(20)}`) throw new TypeError(`${label} cannot be zero`);
  return normalized;
}

function canonicalPubKeyHash(value: string, label: string): `0x${string}` {
  if (!/^0x[0-9a-f]{40}$/.test(value) || value === `0x${"00".repeat(20)}`) {
    throw new TypeError(`${label} must be a nonzero lowercase 20-byte hexadecimal value`);
  }
  return value as `0x${string}`;
}

function canonicalUint64(value: bigint, label: string, allowZero = false): bigint {
  if (typeof value !== "bigint") throw new TypeError(`${label} must be a bigint`);
  if (value < (allowZero ? 0n : 1n) || value > UINT64_MAX) {
    throw new RangeError(`${label} must fit ${allowZero ? "uint64" : "a positive uint64"}`);
  }
  return value;
}

function canonicalZcashChain(value: string): string {
  if (!BIP122_CHAIN.test(value)) {
    throw new TypeError("Zcash chain must be a canonical lowercase BIP-122 identifier with a 32-hex reference");
  }
  return value;
}

function canonicalQuoteChain(value: string): string {
  if (!EIP155_CHAIN.test(value)) {
    throw new TypeError("Quote chain must be a canonical numeric EIP-155 identifier");
  }
  return value;
}

function canonicalZecAsset(value: string, chain: string): string {
  if (value !== `${chain}/slip44:133`) {
    throw new TypeError(`ZEC asset must be the native slip44:133 identity on ${chain}`);
  }
  return value;
}

function canonicalQuoteAsset(value: string, chain: string): string {
  if (!EIP155_ERC20_ASSET.test(value) || !value.startsWith(`${chain}/`)) {
    throw new TypeError(`Quote asset must be a canonical lowercase ERC-20 identity on ${chain}`);
  }
  return value;
}

export function validateSwapTerms(terms: SwapTermsV1): SwapTermsV1 {
  if (terms.version !== SWAP_TERMS_VERSION) throw new TypeError("Unsupported swap terms version");

  const zecChain = canonicalZcashChain(terms.zecChain);
  const quoteChain = canonicalQuoteChain(terms.quoteChain);

  const normalized: SwapTermsV1 = {
    ...terms,
    fillId: canonicalHex32(terms.fillId, "Fill ID"),
    fillIndex: canonicalUint64(terms.fillIndex, "Fill index", true),
    zecOrderHash: canonicalHex32(terms.zecOrderHash, "ZEC order hash"),
    stablecoinOrderHash: canonicalHex32(terms.stablecoinOrderHash, "Stablecoin order hash"),
    zecSellerId: canonicalHex32(terms.zecSellerId, "ZEC seller ID"),
    stablecoinSellerId: canonicalHex32(terms.stablecoinSellerId, "Stablecoin seller ID"),
    zecChain,
    zecAsset: canonicalZecAsset(terms.zecAsset, zecChain),
    quoteChain,
    quoteAsset: canonicalQuoteAsset(terms.quoteAsset, quoteChain),
    zecAmountZatoshis: canonicalUint64(terms.zecAmountZatoshis, "ZEC amount"),
    quoteAmountAtoms: canonicalUint64(terms.quoteAmountAtoms, "Quote amount"),
    executionPriceTicks: canonicalUint64(terms.executionPriceTicks, "Execution price"),
    protocolFeeQuoteAtoms: canonicalUint64(terms.protocolFeeQuoteAtoms, "Protocol fee", true),
    feeRecipient: canonicalAddress(terms.feeRecipient, "Protocol fee recipient"),
    maximumFeeBps: canonicalUint64(terms.maximumFeeBps, "Maximum fee bps", true),
    zcashLockScriptHash: canonicalPubKeyHash(terms.zcashLockScriptHash, "Zcash lock script hash"),
    zcashClaimPubKeyHash: canonicalPubKeyHash(terms.zcashClaimPubKeyHash, "Zcash claim pubkey hash"),
    zcashRefundPubKeyHash: canonicalPubKeyHash(terms.zcashRefundPubKeyHash, "Zcash refund pubkey hash"),
    evmFunder: canonicalAddress(terms.evmFunder, "EVM funder"),
    evmClaimRecipient: canonicalAddress(terms.evmClaimRecipient, "EVM claim recipient"),
    evmRefundRecipient: canonicalAddress(terms.evmRefundRecipient, "EVM refund recipient"),
    evmEscrowContract: canonicalAddress(terms.evmEscrowContract, "EVM escrow contract"),
    secretHash: canonicalHex32(terms.secretHash, "SHA-256 secret hash"),
    authorizationDeadline: canonicalUint64(terms.authorizationDeadline, "Authorization deadline"),
    zecFundBy: canonicalUint64(terms.zecFundBy, "ZEC funding cutoff"),
    evmFundBy: canonicalUint64(terms.evmFundBy, "EVM funding cutoff"),
    evmClaimSafetyCutoff: canonicalUint64(terms.evmClaimSafetyCutoff, "EVM claim safety cutoff"),
    evmRefundTime: canonicalUint64(terms.evmRefundTime, "EVM refund time"),
    zecRefundTime: canonicalUint64(terms.zecRefundTime, "ZEC refund time"),
    timeoutPolicyId: canonicalHex32(terms.timeoutPolicyId, "Timeout policy ID"),
    marketPolicyId: canonicalHex32(terms.marketPolicyId, "Market policy ID"),
    observerPolicyId: canonicalHex32(terms.observerPolicyId, "Observer policy ID"),
    zecFinalityPolicyId: canonicalHex32(terms.zecFinalityPolicyId, "ZEC finality policy ID"),
    evmFinalityPolicyId: canonicalHex32(terms.evmFinalityPolicyId, "EVM finality policy ID"),
  };

  if (normalized.zecOrderHash === normalized.stablecoinOrderHash) throw new Error("Swap orders must be distinct");
  if (normalized.zecSellerId === normalized.stablecoinSellerId) throw new Error("Swap parties must be distinct");
  if (normalized.maximumFeeBps > MAX_SWAP_FEE_BPS) throw new RangeError("Maximum fee exceeds the protocol cap");
  if (normalized.protocolFeeQuoteAtoms * 10_000n > normalized.quoteAmountAtoms * normalized.maximumFeeBps) {
    throw new RangeError("Protocol fee exceeds the signed maximum");
  }
  const quoteNumerator = normalized.zecAmountZatoshis * normalized.executionPriceTicks;
  if (quoteNumerator % SWAP_QUOTE_COST_DIVISOR !== 0n) {
    throw new RangeError("Native swap quote amount requires exact integer settlement");
  }
  if (normalized.quoteAmountAtoms !== quoteNumerator / SWAP_QUOTE_COST_DIVISOR) {
    throw new Error("Quote amount does not reconcile with the signed ZEC amount and execution price");
  }
  if (normalized.fillId !== deriveSwapFillId(normalized)) throw new Error("Fill ID does not match the canonical match fields");
  return Object.freeze(normalized);
}

export function roleForParty(terms: SwapTermsV1, partyId: Hex32): SwapRole {
  const normalized = canonicalHex32(partyId, "Party ID");
  if (normalized === terms.zecSellerId) return "zec-seller";
  if (normalized === terms.stablecoinSellerId) return "stablecoin-seller";
  throw new Error("Party is not authorized by these swap terms");
}

const CANONICAL_FIELDS: readonly (keyof SwapTermsV1)[] = [
  "version", "fillId", "fillIndex", "zecOrderHash", "stablecoinOrderHash",
  "zecSellerId", "stablecoinSellerId", "zecChain", "zecAsset", "quoteChain", "quoteAsset",
  "zecAmountZatoshis", "quoteAmountAtoms", "executionPriceTicks", "protocolFeeQuoteAtoms", "feeRecipient", "maximumFeeBps",
  "zcashLockScriptHash", "zcashClaimPubKeyHash", "zcashRefundPubKeyHash", "evmFunder", "evmClaimRecipient", "evmRefundRecipient",
  "evmEscrowContract", "secretHash", "authorizationDeadline", "zecFundBy", "evmFundBy",
  "evmClaimSafetyCutoff", "evmRefundTime", "zecRefundTime", "timeoutPolicyId", "marketPolicyId", "observerPolicyId",
  "zecFinalityPolicyId", "evmFinalityPolicyId",
] as const;

export function encodeSwapTerms(terms: SwapTermsV1): string {
  const validated = validateSwapTerms(terms);
  return ["PhlebasSwapTerms", ...CANONICAL_FIELDS.map((field) => `${field}=${validated[field]}`)].join("\n");
}

export function hashSwapTerms(terms: SwapTermsV1): Hex32 {
  return sha256Hex(encodeSwapTerms(terms));
}

export function swapIdForTerms(terms: SwapTermsV1): Hex32 {
  return sha256Hex(`PhlebasSwapId\nversion=${SWAP_TERMS_VERSION}\ntermsHash=${hashSwapTerms(terms)}`);
}

export function deriveSwapFillId(terms: Pick<
  SwapTermsV1,
  "zecOrderHash" | "stablecoinOrderHash" | "fillIndex" | "zecAmountZatoshis" | "quoteAmountAtoms" | "executionPriceTicks"
>): Hex32 {
  return sha256Hex([
    "PhlebasSwapFill",
    "version=1",
    `zecOrderHash=${canonicalHex32(terms.zecOrderHash, "ZEC order hash")}`,
    `stablecoinOrderHash=${canonicalHex32(terms.stablecoinOrderHash, "Stablecoin order hash")}`,
    `fillIndex=${canonicalUint64(terms.fillIndex, "Fill index", true)}`,
    `zecAmountZatoshis=${canonicalUint64(terms.zecAmountZatoshis, "ZEC amount")}`,
    `quoteAmountAtoms=${canonicalUint64(terms.quoteAmountAtoms, "Quote amount")}`,
    `executionPriceTicks=${canonicalUint64(terms.executionPriceTicks, "Execution price")}`,
  ].join("\n"));
}

export function validateSwapMarketPolicy(policy: SwapMarketPolicyV1): SwapMarketPolicyV1 {
  if (policy.version !== 1) throw new TypeError("Unsupported market policy version");
  if (!Array.isArray(policy.markets) || policy.markets.length === 0) throw new Error("Market policy must approve at least one exact market");
  const markets = policy.markets.map((market) => {
    const zecChain = canonicalZcashChain(market.zecChain);
    const quoteChain = canonicalQuoteChain(market.quoteChain);
    return Object.freeze({
      zecChain,
      zecAsset: canonicalZecAsset(market.zecAsset, zecChain),
      quoteChain,
      quoteAsset: canonicalQuoteAsset(market.quoteAsset, quoteChain),
    });
  });
  const keys = markets.map((market) => [market.zecChain, market.zecAsset, market.quoteChain, market.quoteAsset].join("|"));
  if (new Set(keys).size !== keys.length) throw new Error("Market policy contains duplicate identities");
  const sorted = [...keys].sort();
  if (keys.some((key, index) => key !== sorted[index])) throw new TypeError("Market policy identities must be sorted canonically");
  return Object.freeze({ version: 1, markets: Object.freeze(markets) });
}

export function hashSwapMarketPolicy(policy: SwapMarketPolicyV1): Hex32 {
  const validated = validateSwapMarketPolicy(policy);
  return sha256Hex([
    "PhlebasSwapMarketPolicy",
    "version=1",
    ...validated.markets.map((market, index) => (
      `market[${index}]=${market.zecChain}|${market.zecAsset}|${market.quoteChain}|${market.quoteAsset}`
    )),
  ].join("\n"));
}

export function assertApprovedSwapMarket(terms: SwapTermsV1, policy: SwapMarketPolicyV1): SwapMarketPolicyV1 {
  const validatedTerms = validateSwapTerms(terms);
  const validatedPolicy = validateSwapMarketPolicy(policy);
  if (hashSwapMarketPolicy(validatedPolicy) !== validatedTerms.marketPolicyId) {
    throw new Error("Market policy does not match signed terms");
  }
  const approved = validatedPolicy.markets.some((market) => (
    market.zecChain === validatedTerms.zecChain
    && market.zecAsset === validatedTerms.zecAsset
    && market.quoteChain === validatedTerms.quoteChain
    && market.quoteAsset === validatedTerms.quoteAsset
  ));
  if (!approved) throw new Error("Swap market is not approved by the signed market policy");
  return validatedPolicy;
}
