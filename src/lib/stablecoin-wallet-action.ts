import {
  encodeClaimCalldata,
  encodeFundCalldata,
  encodeRefundCalldata,
} from "./conditional-lock-abi.ts";
import { bytesToHex, hexToBytes, keccak256 } from "./keccak.ts";
import {
  ETHEREUM_MAINNET_CHAIN_HEX,
  assertMainnetStablecoinAddress,
  mainnetMarket,
  type MainnetQuoteSymbol,
} from "./mainnet-assets.ts";
import type { MarketId } from "./market-data.ts";
import { UINT256_MAX, normalizeAddress, normalizeHex32, type Hex32, type HexAddress } from "./order-domain.ts";
import { sha256Hex } from "./sha256.ts";

export const STABLECOIN_WALLET_REVIEW_VERSION = 1 as const;
export const STABLECOIN_NETWORK_ACTION = "disabled-until-deployment-manifest" as const;

export type StablecoinLockContext = Readonly<{
  marketId: MarketId;
  token: string;
  lock: string;
  funder: string;
  claimRecipient: string;
  amountAtoms: bigint;
  termsHash: string;
  secretHash: string;
}>;

export type StablecoinWalletAction = Readonly<{
  version: typeof STABLECOIN_WALLET_REVIEW_VERSION;
  action: "reset-allowance" | "approve-exact" | "fund-lock" | "claim-lock" | "refund-lock";
  chainId: typeof ETHEREUM_MAINNET_CHAIN_HEX;
  marketId: MarketId;
  settlementPair: "ZEC-USDC" | "ZEC-USDT";
  symbol: MainnetQuoteSymbol;
  from: HexAddress;
  to: HexAddress;
  value: "0x0";
  data: `0x${string}`;
  token: HexAddress;
  lock: HexAddress;
  amountAtoms: string;
  termsHash: Hex32;
  expectedLockState: "unfunded" | "funded";
  expectedAllowanceAfter: string | null;
  networkAction: typeof STABLECOIN_NETWORK_ACTION;
}>;

type NormalizedContext = Readonly<{
  marketId: MarketId;
  settlementPair: "ZEC-USDC" | "ZEC-USDT";
  symbol: MainnetQuoteSymbol;
  token: HexAddress;
  lock: HexAddress;
  funder: HexAddress;
  claimRecipient: HexAddress;
  amountAtoms: bigint;
  termsHash: Hex32;
  secretHash: Hex32;
}>;

function nonzeroAddress(value: string, label: string): HexAddress {
  const address = normalizeAddress(value, label);
  if (address === `0x${"00".repeat(20)}`) throw new RangeError(`${label} cannot be zero`);
  return address;
}

function nonzeroHex32(value: string, label: string): Hex32 {
  const hex = normalizeHex32(value, label);
  if (hex === `0x${"00".repeat(32)}`) throw new RangeError(`${label} cannot be zero`);
  return hex;
}

function uint256(value: bigint, label: string, allowZero: boolean): bigint {
  if (typeof value !== "bigint" || value < (allowZero ? 0n : 1n) || value > UINT256_MAX) {
    throw new RangeError(`${label} must fit ${allowZero ? "uint256" : "a positive uint256"}`);
  }
  return value;
}

function normalizeContext(input: StablecoinLockContext): NormalizedContext {
  const market = mainnetMarket(input.marketId);
  const token = nonzeroAddress(input.token, "Stablecoin token");
  assertMainnetStablecoinAddress(market.quote.symbol, token);
  const lock = nonzeroAddress(input.lock, "Conditional lock");
  const funder = nonzeroAddress(input.funder, "Stablecoin funder");
  const claimRecipient = nonzeroAddress(input.claimRecipient, "Stablecoin claim recipient");
  if (lock === token || funder === claimRecipient || funder === token || claimRecipient === token) {
    throw new Error("Stablecoin wallet action roles must be distinct from the token and each other");
  }
  return Object.freeze({
    marketId: market.id,
    settlementPair: market.settlementPair,
    symbol: market.quote.symbol,
    token,
    lock,
    funder,
    claimRecipient,
    amountAtoms: uint256(input.amountAtoms, "Stablecoin amount", false),
    termsHash: nonzeroHex32(input.termsHash, "Swap terms hash"),
    secretHash: nonzeroHex32(input.secretHash, "Swap secret hash"),
  });
}

function selector(signature: string): string {
  return bytesToHex(keccak256(new TextEncoder().encode(signature)).slice(0, 4));
}

export const ERC20_APPROVE_SELECTOR = selector("approve(address,uint256)");

function encodeApprove(spender: HexAddress, amount: bigint): `0x${string}` {
  return `0x${ERC20_APPROVE_SELECTOR}${spender.slice(2).padStart(64, "0")}${amount.toString(16).padStart(64, "0")}`;
}

function review(
  context: NormalizedContext,
  values: Pick<StablecoinWalletAction, "action" | "from" | "to" | "data" | "expectedLockState" | "expectedAllowanceAfter">,
): StablecoinWalletAction {
  return Object.freeze({
    version: STABLECOIN_WALLET_REVIEW_VERSION,
    ...values,
    chainId: ETHEREUM_MAINNET_CHAIN_HEX,
    marketId: context.marketId,
    settlementPair: context.settlementPair,
    symbol: context.symbol,
    value: "0x0",
    token: context.token,
    lock: context.lock,
    amountAtoms: context.amountAtoms.toString(),
    termsHash: context.termsHash,
    networkAction: STABLECOIN_NETWORK_ACTION,
  });
}

export function planStablecoinFundingActions(
  input: StablecoinLockContext,
  currentAllowance: bigint,
): readonly StablecoinWalletAction[] {
  const context = normalizeContext(input);
  const allowance = uint256(currentAllowance, "Current stablecoin allowance", true);
  const actions: StablecoinWalletAction[] = [];
  if (allowance !== context.amountAtoms) {
    if (context.symbol === "USDT" && allowance !== 0n) {
      actions.push(review(context, {
        action: "reset-allowance",
        from: context.funder,
        to: context.token,
        data: encodeApprove(context.lock, 0n),
        expectedLockState: "unfunded",
        expectedAllowanceAfter: "0",
      }));
    }
    actions.push(review(context, {
      action: "approve-exact",
      from: context.funder,
      to: context.token,
      data: encodeApprove(context.lock, context.amountAtoms),
      expectedLockState: "unfunded",
      expectedAllowanceAfter: context.amountAtoms.toString(),
    }));
  }
  actions.push(review(context, {
    action: "fund-lock",
    from: context.funder,
    to: context.lock,
    data: encodeFundCalldata() as `0x${string}`,
    expectedLockState: "unfunded",
    expectedAllowanceAfter: "0",
  }));
  return Object.freeze(actions);
}

export function createStablecoinClaimAction(
  input: StablecoinLockContext,
  actor: string,
  preimage: string,
): StablecoinWalletAction {
  const context = normalizeContext(input);
  const claimant = nonzeroAddress(actor, "Stablecoin claim actor");
  if (claimant !== context.claimRecipient) throw new Error("Stablecoin claim actor is not the immutable recipient");
  const bytes = hexToBytes(preimage);
  if (bytes.length !== 32) throw new TypeError("Swap preimage must be exactly 32 bytes");
  if (sha256Hex(bytes) !== context.secretHash) throw new Error("Swap preimage does not match the signed secret hash");
  return review(context, {
    action: "claim-lock",
    from: claimant,
    to: context.lock,
    data: encodeClaimCalldata(preimage) as `0x${string}`,
    expectedLockState: "funded",
    expectedAllowanceAfter: null,
  });
}

export function createStablecoinRefundAction(
  input: StablecoinLockContext,
  actor: string,
): StablecoinWalletAction {
  const context = normalizeContext(input);
  const funder = nonzeroAddress(actor, "Stablecoin refund actor");
  if (funder !== context.funder) throw new Error("Stablecoin refund actor is not the immutable funder");
  return review(context, {
    action: "refund-lock",
    from: funder,
    to: context.lock,
    data: encodeRefundCalldata() as `0x${string}`,
    expectedLockState: "funded",
    expectedAllowanceAfter: null,
  });
}
