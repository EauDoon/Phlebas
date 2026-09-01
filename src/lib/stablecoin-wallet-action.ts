import trackedConditionalLockManifest from "../../contracts/manifests/conditional-lock.not-deployed.json" with { type: "json" };

import {
  encodeClaimCalldata,
  encodeFundCalldata,
  encodeRefundCalldata,
  type ConditionalLockTerms,
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

export const STABLECOIN_WALLET_REVIEW_VERSION = 2 as const;
export const STABLECOIN_NETWORK_ACTION = "disabled-until-deployment-manifest" as const;

export type StablecoinLockState = "unfunded" | "funded";

/**
 * An independently sourced Ethereum observation. A future submitter must obtain
 * these values from chain ID 1 and compare the code hash with an approved,
 * receipt-backed deployment record before it can enable a wallet request.
 */
export type StablecoinLockDeploymentReceipt = Readonly<{
  chainId: typeof ETHEREUM_MAINNET_CHAIN_HEX;
  address: string;
  transactionHash: string;
  blockNumber: bigint;
  blockHash: string;
  receiptStatus: "0x1";
  runtimeBytecodeSha256: string;
}>;

export type StablecoinLockObservation = Readonly<{
  chainId: typeof ETHEREUM_MAINNET_CHAIN_HEX;
  lock: string;
  runtimeBytecode: string;
  immutableTerms: ConditionalLockTerms;
  state: StablecoinLockState;
  blockNumber: bigint;
  blockHash: string;
  blockTimestampSeconds: bigint;
}>;

export type StablecoinLockContext = Readonly<{
  marketId: MarketId;
  lock: string;
  expectedTerms: ConditionalLockTerms;
  deploymentReceipt: StablecoinLockDeploymentReceipt;
  observation: StablecoinLockObservation;
}>;

export type StablecoinAllowanceObservation = Readonly<{
  chainId: typeof ETHEREUM_MAINNET_CHAIN_HEX;
  token: string;
  owner: string;
  spender: string;
  amountAtoms: bigint;
  blockNumber: bigint;
  blockHash: string;
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
  swapId: Hex32;
  amountAtoms: string;
  termsHash: Hex32;
  secretHash: Hex32;
  fundingCutoffSeconds: string;
  claimCutoffSeconds: string;
  refundTimeSeconds: string;
  lockRuntimeBytecodeSha256: Hex32;
  observationBlockNumber: string;
  observationBlockHash: Hex32;
  observationBlockTimestampSeconds: string;
  expectedLockState: StablecoinLockState;
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
  refundRecipient: HexAddress;
  amountAtoms: bigint;
  swapId: Hex32;
  termsHash: Hex32;
  secretHash: Hex32;
  fundingCutoff: bigint;
  claimCutoff: bigint;
  refundTime: bigint;
  observedState: StablecoinLockState;
  runtimeBytecodeSha256: Hex32;
  observationBlockNumber: bigint;
  observationBlockHash: Hex32;
  observationBlockTimestampSeconds: bigint;
}>;

const ZERO_ADDRESS = `0x${"00".repeat(20)}`;
const ZERO_HEX32 = `0x${"00".repeat(32)}`;
const UINT64_MAX = (1n << 64n) - 1n;
const TRACKED_CONDITIONAL_LOCK_MANIFEST: unknown = structuredClone(trackedConditionalLockManifest);

type ApprovedDeploymentManifest = Readonly<{
  address: HexAddress;
  transactionHash: Hex32;
  blockNumber: bigint;
  blockHash: Hex32;
  runtimeBytecodeSha256: Hex32;
  terms: ReturnType<typeof normalizeTerms>;
}>;

function nonzeroAddress(value: string, label: string): HexAddress {
  const address = normalizeAddress(value, label);
  if (address === ZERO_ADDRESS) throw new RangeError(`${label} cannot be zero`);
  return address;
}

function nonzeroHex32(value: string, label: string): Hex32 {
  const hex = normalizeHex32(value, label);
  if (hex === ZERO_HEX32) throw new RangeError(`${label} cannot be zero`);
  return hex;
}

function uint256(value: bigint, label: string, allowZero: boolean): bigint {
  if (typeof value !== "bigint" || value < (allowZero ? 0n : 1n) || value > UINT256_MAX) {
    throw new RangeError(`${label} must fit ${allowZero ? "uint256" : "a positive uint256"}`);
  }
  return value;
}

function uint64(value: bigint, label: string, allowZero = false): bigint {
  if (typeof value !== "bigint" || value < (allowZero ? 0n : 1n) || value > UINT64_MAX) {
    throw new RangeError(`${label} must fit ${allowZero ? "uint64" : "a positive uint64"}`);
  }
  return value;
}

function runtimeBytecode(value: string, label: string): Uint8Array {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value) || (value.length - 2) % 2 !== 0) {
    throw new TypeError(`${label} must be nonempty even-length hex bytes`);
  }
  return hexToBytes(value);
}

function normalizeTerms(terms: ConditionalLockTerms, label: string) {
  const token = nonzeroAddress(terms.token, `${label} token`);
  const funder = nonzeroAddress(terms.funder, `${label} funder`);
  const claimRecipient = nonzeroAddress(terms.claimRecipient, `${label} claim recipient`);
  const refundRecipient = nonzeroAddress(terms.refundRecipient, `${label} refund recipient`);
  const amount = uint256(terms.amount, `${label} amount`, false);
  const swapId = nonzeroHex32(terms.swapId, `${label} swap ID`);
  const termsHash = nonzeroHex32(terms.termsHash, `${label} terms hash`);
  const hashlock = nonzeroHex32(terms.hashlock, `${label} hashlock`);
  const fundingCutoff = uint64(terms.fundingCutoff, `${label} funding cutoff`);
  const claimCutoff = uint64(terms.claimCutoff, `${label} claim cutoff`);
  const refundTime = uint64(terms.refundTime, `${label} refund time`);
  if (funder !== refundRecipient) throw new Error(`${label} refund recipient must equal the funder`);
  if (funder === claimRecipient || token === funder || token === claimRecipient) {
    throw new Error(`${label} roles must be distinct from the token and each other`);
  }
  if (fundingCutoff >= claimCutoff || claimCutoff + 1n >= refundTime) {
    throw new Error(`${label} deadlines must increase and leave a refund gap`);
  }
  return Object.freeze({
    token,
    funder,
    claimRecipient,
    refundRecipient,
    amount,
    swapId,
    termsHash,
    hashlock,
    fundingCutoff,
    claimCutoff,
    refundTime,
  });
}

function sameTerms(left: ReturnType<typeof normalizeTerms>, right: ReturnType<typeof normalizeTerms>): boolean {
  return left.token === right.token
    && left.funder === right.funder
    && left.claimRecipient === right.claimRecipient
    && left.refundRecipient === right.refundRecipient
    && left.amount === right.amount
    && left.swapId === right.swapId
    && left.termsHash === right.termsHash
    && left.hashlock === right.hashlock
    && left.fundingCutoff === right.fundingCutoff
    && left.claimCutoff === right.claimCutoff
    && left.refundTime === right.refundTime;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  return value;
}

/**
 * Loads the one repository-tracked deployment authority. Caller observations
 * can corroborate this record, but cannot create or widen it. The checked-in
 * manifest is intentionally undeployed, so this function currently fails
 * closed before any approval or lock calldata can be created.
 */
function approvedDeploymentManifest(): ApprovedDeploymentManifest {
  const manifest = record(TRACKED_CONDITIONAL_LOCK_MANIFEST, "Tracked conditional lock manifest");
  const deployment = record(manifest.deployment, "Tracked conditional lock deployment");
  const terms = record(record(manifest.terms, "Tracked conditional lock terms").values, "Tracked conditional lock values");
  if (manifest.manifestType !== "conditional-lock-deployment"
    || manifest.deployed !== true
    || deployment.network !== "ethereum-mainnet"
    || deployment.chainId !== "1"
    || deployment.receiptStatus !== "0x1"
    || deployment.receiptVerified !== true
    || deployment.sourceVerified !== true
    || deployment.constructorArgumentsVerified !== true
    || deployment.runtimeBytecodeVerified !== true) {
    throw new Error("No approved Ethereum Mainnet conditional lock deployment manifest is active");
  }
  return Object.freeze({
    address: nonzeroAddress(requiredString(deployment.address, "Manifest deployment address"), "Manifest deployment address"),
    transactionHash: nonzeroHex32(requiredString(deployment.transactionHash, "Manifest transaction hash"), "Manifest transaction hash"),
    blockNumber: uint256(BigInt(requiredString(deployment.blockNumber, "Manifest block number")), "Manifest block number", false),
    blockHash: nonzeroHex32(requiredString(deployment.blockHash, "Manifest block hash"), "Manifest block hash"),
    runtimeBytecodeSha256: nonzeroHex32(
      requiredString(deployment.runtimeBytecodeSha256, "Manifest runtime bytecode SHA-256"),
      "Manifest runtime bytecode SHA-256",
    ),
    terms: normalizeTerms({
      swapId: requiredString(terms.swapId, "Manifest swap ID"),
      termsHash: requiredString(terms.termsHash, "Manifest terms hash"),
      token: requiredString(terms.token, "Manifest token"),
      funder: requiredString(terms.funder, "Manifest funder"),
      claimRecipient: requiredString(terms.claimRecipient, "Manifest claim recipient"),
      refundRecipient: requiredString(terms.refundRecipient, "Manifest refund recipient"),
      amount: BigInt(requiredString(terms.amount, "Manifest amount")),
      hashlock: requiredString(terms.hashlock, "Manifest hashlock"),
      fundingCutoff: BigInt(requiredString(terms.fundingCutoff, "Manifest funding cutoff")),
      claimCutoff: BigInt(requiredString(terms.claimCutoff, "Manifest claim cutoff")),
      refundTime: BigInt(requiredString(terms.refundTime, "Manifest refund time")),
    }, "Manifest conditional lock"),
  });
}

function normalizeContext(input: StablecoinLockContext): NormalizedContext {
  const market = mainnetMarket(input.marketId);
  const lock = nonzeroAddress(input.lock, "Conditional lock");
  const approved = approvedDeploymentManifest();
  const receipt = input.deploymentReceipt;
  if (receipt.chainId !== ETHEREUM_MAINNET_CHAIN_HEX
    || receipt.receiptStatus !== "0x1") {
    throw new Error("Conditional lock observation must report a successful Ethereum Mainnet deployment receipt");
  }
  if (nonzeroAddress(receipt.address, "Deployment receipt address") !== lock
    || lock !== approved.address
    || nonzeroHex32(receipt.transactionHash, "Deployment transaction hash") !== approved.transactionHash
    || receipt.blockNumber !== approved.blockNumber
    || nonzeroHex32(receipt.blockHash, "Deployment block hash") !== approved.blockHash
    || nonzeroHex32(receipt.runtimeBytecodeSha256, "Deployment runtime bytecode SHA-256") !== approved.runtimeBytecodeSha256) {
    throw new Error("Conditional lock receipt does not match the repository-approved deployment manifest");
  }
  const deploymentBlockNumber = uint256(receipt.blockNumber, "Deployment block number", false);
  const observation = input.observation;
  if (observation.chainId !== ETHEREUM_MAINNET_CHAIN_HEX) {
    throw new Error("Conditional lock observation must come from Ethereum Mainnet chain ID 1");
  }
  if (nonzeroAddress(observation.lock, "Observed conditional lock") !== lock) {
    throw new Error("Observed conditional lock address does not match the reviewed deployment");
  }
  const expectedTerms = normalizeTerms(input.expectedTerms, "Expected conditional lock");
  if (!sameTerms(expectedTerms, approved.terms)) {
    throw new Error("Expected conditional lock terms do not match the repository-approved deployment manifest");
  }
  const observedTerms = normalizeTerms(observation.immutableTerms, "Observed conditional lock");
  if (!sameTerms(expectedTerms, observedTerms)) {
    throw new Error("Observed conditional lock immutable terms do not match all 11 reviewed terms");
  }
  assertMainnetStablecoinAddress(market.quote.symbol, expectedTerms.token);
  if (lock === expectedTerms.token || lock === expectedTerms.funder || lock === expectedTerms.claimRecipient) {
    throw new Error("Conditional lock address must differ from the token and user roles");
  }
  const observedRuntime = runtimeBytecode(observation.runtimeBytecode, "Observed runtime bytecode");
  const expectedRuntimeHash = nonzeroHex32(
    approved.runtimeBytecodeSha256,
    "Approved runtime bytecode SHA-256",
  );
  if (sha256Hex(observedRuntime) !== expectedRuntimeHash) {
    throw new Error("Observed conditional lock runtime bytecode does not match the approved deployment hash");
  }
  if (observation.state !== "unfunded" && observation.state !== "funded") {
    throw new Error("Observed conditional lock state is not actionable");
  }
  const blockNumber = uint256(observation.blockNumber, "Observation block number", false);
  if (blockNumber < deploymentBlockNumber) {
    throw new Error("Conditional lock observation predates its verified deployment receipt");
  }
  const blockHash = nonzeroHex32(observation.blockHash, "Observation block hash");
  const blockTimestampSeconds = uint64(observation.blockTimestampSeconds, "Observation block timestamp", true);
  return Object.freeze({
    marketId: market.id,
    settlementPair: market.settlementPair,
    symbol: market.quote.symbol,
    token: expectedTerms.token,
    lock,
    funder: expectedTerms.funder,
    claimRecipient: expectedTerms.claimRecipient,
    refundRecipient: expectedTerms.refundRecipient,
    amountAtoms: expectedTerms.amount,
    swapId: expectedTerms.swapId,
    termsHash: expectedTerms.termsHash,
    secretHash: expectedTerms.hashlock,
    fundingCutoff: expectedTerms.fundingCutoff,
    claimCutoff: expectedTerms.claimCutoff,
    refundTime: expectedTerms.refundTime,
    observedState: observation.state,
    runtimeBytecodeSha256: expectedRuntimeHash,
    observationBlockNumber: blockNumber,
    observationBlockHash: blockHash,
    observationBlockTimestampSeconds: blockTimestampSeconds,
  });
}

function requireState(context: NormalizedContext, state: StablecoinLockState): void {
  if (context.observedState !== state) {
    throw new Error(`Conditional lock must be observed ${state} before this review can be created`);
  }
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
    swapId: context.swapId,
    amountAtoms: context.amountAtoms.toString(),
    termsHash: context.termsHash,
    secretHash: context.secretHash,
    fundingCutoffSeconds: context.fundingCutoff.toString(),
    claimCutoffSeconds: context.claimCutoff.toString(),
    refundTimeSeconds: context.refundTime.toString(),
    lockRuntimeBytecodeSha256: context.runtimeBytecodeSha256,
    observationBlockNumber: context.observationBlockNumber.toString(),
    observationBlockHash: context.observationBlockHash,
    observationBlockTimestampSeconds: context.observationBlockTimestampSeconds.toString(),
    networkAction: STABLECOIN_NETWORK_ACTION,
  });
}

export function planStablecoinFundingActions(
  input: StablecoinLockContext,
  allowanceObservation: StablecoinAllowanceObservation,
): readonly StablecoinWalletAction[] {
  const context = normalizeContext(input);
  requireState(context, "unfunded");
  if (context.observationBlockTimestampSeconds > context.fundingCutoff) {
    throw new Error("Conditional lock funding cutoff has passed");
  }
  if (allowanceObservation.chainId !== ETHEREUM_MAINNET_CHAIN_HEX
    || nonzeroAddress(allowanceObservation.token, "Allowance token") !== context.token
    || nonzeroAddress(allowanceObservation.owner, "Allowance owner") !== context.funder
    || nonzeroAddress(allowanceObservation.spender, "Allowance spender") !== context.lock
    || allowanceObservation.blockNumber !== context.observationBlockNumber
    || nonzeroHex32(allowanceObservation.blockHash, "Allowance block hash") !== context.observationBlockHash) {
    throw new Error("Stablecoin allowance must be observed for the exact fill at the same reviewed Ethereum block");
  }
  const allowance = uint256(allowanceObservation.amountAtoms, "Current stablecoin allowance", true);
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
  requireState(context, "funded");
  if (context.observationBlockTimestampSeconds > context.claimCutoff) {
    throw new Error("Conditional lock claim cutoff has passed");
  }
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
  requireState(context, "funded");
  if (context.observationBlockTimestampSeconds < context.refundTime) {
    throw new Error("Conditional lock refund time has not been reached");
  }
  const funder = nonzeroAddress(actor, "Stablecoin refund actor");
  if (funder !== context.refundRecipient) throw new Error("Stablecoin refund actor is not the immutable refund recipient");
  return review(context, {
    action: "refund-lock",
    from: funder,
    to: context.lock,
    data: encodeRefundCalldata() as `0x${string}`,
    expectedLockState: "funded",
    expectedAllowanceAfter: null,
  });
}
