import { UINT64_MAX, normalizeAddress, normalizeHex32, type Hex32, type HexAddress } from "./order-domain.ts";
import { sha256Hex } from "./sha256.ts";

export const SWAP_TERMS_VERSION = 1 as const;
export const MAX_SWAP_FEE_BPS = 30n;

export type SwapRole = "zec-seller" | "stablecoin-seller";

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
  "zecAmountZatoshis", "quoteAmountAtoms", "executionPriceTicks", "protocolFeeQuoteAtoms", "maximumFeeBps",
  "zcashLockScriptHash", "zcashClaimPubKeyHash", "zcashRefundPubKeyHash", "evmFunder", "evmClaimRecipient", "evmRefundRecipient",
  "evmEscrowContract", "secretHash", "authorizationDeadline", "zecFundBy", "evmFundBy",
  "evmClaimSafetyCutoff", "evmRefundTime", "zecRefundTime", "timeoutPolicyId", "observerPolicyId",
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
