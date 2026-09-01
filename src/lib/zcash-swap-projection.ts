import { bytesToHex, hexToBytes } from "./keccak.ts";
import {
  ETHEREUM_MAINNET_NETWORK,
  ETHEREUM_MAINNET_USDC_ASSET,
  ETHEREUM_MAINNET_USDT_ASSET,
  NATIVE_ZEC_ASSET,
  ZCASH_MAINNET_NETWORK,
} from "./mainnet-assets.ts";
import { hashSwapTerms, swapIdForTerms, validateSwapTerms, type SwapTermsV1 } from "./swap-domain.ts";
import {
  CLTV_LOCKTIME_THRESHOLD,
  CLTV_MAX_LOCKTIME,
  buildHtlcRedeemScript,
  htlcP2shAddress,
  validateHtlcRedeemScript,
} from "./zcash-htlc.ts";
import { encodeTransparentAddress, hash160 } from "./zcash-transparent.ts";

export const ZCASH_SWAP_PROJECTION_VERSION = 1 as const;

export type ZcashSwapProjectionV1 = Readonly<{
  version: typeof ZCASH_SWAP_PROJECTION_VERSION;
  network: "mainnet";
  chain: typeof ZCASH_MAINNET_NETWORK;
  asset: typeof NATIVE_ZEC_ASSET;
  quoteChain: typeof ETHEREUM_MAINNET_NETWORK;
  quoteAsset: typeof ETHEREUM_MAINNET_USDC_ASSET | typeof ETHEREUM_MAINNET_USDT_ASSET;
  swapId: `0x${string}`;
  termsHash: `0x${string}`;
  amountZatoshis: string;
  fundingCutoffSeconds: string;
  refundTimeSeconds: string;
  secretHash: `0x${string}`;
  claimPubKeyHash: `0x${string}`;
  refundPubKeyHash: `0x${string}`;
  claimAddress: string;
  refundAddress: string;
  redeemScriptHex: `0x${string}`;
  lockScriptHash: `0x${string}`;
  lockAddress: string;
}>;

function exactMainnetQuoteAsset(value: string): ZcashSwapProjectionV1["quoteAsset"] {
  if (value !== ETHEREUM_MAINNET_USDC_ASSET && value !== ETHEREUM_MAINNET_USDT_ASSET) {
    throw new Error("Zcash settlement terms require exact Ethereum Mainnet USDC or USDT");
  }
  return value;
}

function bytes20(value: string, label: string): Uint8Array {
  const bytes = hexToBytes(value);
  if (bytes.length !== 20) throw new RangeError(`${label} must be exactly 20 bytes`);
  return bytes;
}

export function projectZcashSwapTerms(terms: SwapTermsV1): ZcashSwapProjectionV1 {
  const exact = validateSwapTerms(terms);
  if (exact.zecChain !== ZCASH_MAINNET_NETWORK || exact.zecAsset !== NATIVE_ZEC_ASSET) {
    throw new Error("Zcash settlement terms require exact Zcash Mainnet native ZEC");
  }
  if (exact.quoteChain !== ETHEREUM_MAINNET_NETWORK) {
    throw new Error("Zcash settlement terms require Ethereum Mainnet quote settlement");
  }
  const quoteAsset = exactMainnetQuoteAsset(exact.quoteAsset);
  if (exact.zecRefundTime < BigInt(CLTV_LOCKTIME_THRESHOLD) || exact.zecRefundTime > BigInt(CLTV_MAX_LOCKTIME)) {
    throw new RangeError("Zcash refund time must be a timestamp-style uint32 CLTV value");
  }

  const digest = hexToBytes(exact.secretHash);
  const claimPkh = bytes20(exact.zcashClaimPubKeyHash, "Zcash claim public-key hash");
  const refundPkh = bytes20(exact.zcashRefundPubKeyHash, "Zcash refund public-key hash");
  const redeemScript = buildHtlcRedeemScript({
    digest,
    claimPkh,
    refundPkh,
    lock: { type: "timestamp", value: Number(exact.zecRefundTime) },
  });
  validateHtlcRedeemScript(redeemScript, {
    digest,
    claimPkh,
    refundPkh,
    lock: { type: "timestamp", value: Number(exact.zecRefundTime) },
  });
  const lockScriptHash = `0x${bytesToHex(hash160(redeemScript))}` as `0x${string}`;
  if (lockScriptHash !== exact.zcashLockScriptHash) {
    throw new Error("Zcash HTLC redeem script does not match the signed lock script hash");
  }

  return Object.freeze({
    version: ZCASH_SWAP_PROJECTION_VERSION,
    network: "mainnet",
    chain: ZCASH_MAINNET_NETWORK,
    asset: NATIVE_ZEC_ASSET,
    quoteChain: ETHEREUM_MAINNET_NETWORK,
    quoteAsset,
    swapId: swapIdForTerms(exact),
    termsHash: hashSwapTerms(exact),
    amountZatoshis: exact.zecAmountZatoshis.toString(),
    fundingCutoffSeconds: exact.zecFundBy.toString(),
    refundTimeSeconds: exact.zecRefundTime.toString(),
    secretHash: exact.secretHash,
    claimPubKeyHash: exact.zcashClaimPubKeyHash,
    refundPubKeyHash: exact.zcashRefundPubKeyHash,
    claimAddress: encodeTransparentAddress("mainnet", "p2pkh", claimPkh),
    refundAddress: encodeTransparentAddress("mainnet", "p2pkh", refundPkh),
    redeemScriptHex: `0x${bytesToHex(redeemScript)}` as `0x${string}`,
    lockScriptHash,
    lockAddress: htlcP2shAddress(redeemScript, "mainnet"),
  });
}
