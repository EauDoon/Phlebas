import {
  decodeConditionalLockConstructorArgs,
  encodeConditionalLockConstructorArgs,
  encodeFundCalldata,
  FUNDED_EVENT_SIGNATURE,
  LOCK_CREATED_EVENT_SIGNATURE,
  type ConditionalLockTerms,
} from "../../src/lib/conditional-lock-abi.ts";
import {
  assertEthereumMainnetChainId,
  ETHEREUM_MAINNET_CHAIN_HEX,
} from "../../src/lib/mainnet-assets.ts";
import { hexToBytes } from "../../src/lib/keccak.ts";
import {
  assertUint,
  normalizeAddress,
  normalizeHex32,
  type Hex32,
  type HexAddress,
} from "../../src/lib/order-domain.ts";
import { sha256Hex } from "../../src/lib/sha256.ts";
import { assertSwapStateIntegrity, type SwapState } from "../../src/lib/swap-state.ts";
import type {
  StablecoinClaimReadProvider,
  StablecoinLockDeploymentAuthority,
  StablecoinLockDeploymentReceipt,
} from "../../src/lib/stablecoin-wallet-action.ts";
import { approvedDeploymentManifest } from "../../src/lib/stablecoin-wallet-action.ts";
import type {
  EvmFundingReceipt,
  EvmReceiptLog,
} from "../../src/lib/evm-bound-evidence.ts";
import { conditionalLockTermsForSwapState } from "../../src/lib/evm-bound-evidence.ts";

const ZERO_ADDRESS = `0x${"00".repeat(20)}`;
const ZERO_HEX32 = `0x${"00".repeat(32)}`;
const LOCK_CREATED_TOPIC = `0x${LOCK_CREATED_EVENT_SIGNATURE}`;
const FUNDED_TOPIC = `0x${FUNDED_EVENT_SIGNATURE}`;
const MAX_RECEIPT_LOGS = 1_024;
// ponytail: bound untrusted receipt log data to 1 MiB; use indexed source queries if this ceiling proves too low.
const MAX_RECEIPT_DATA_BYTES = 1_048_576;
const MAX_TRANSACTION_INPUT_BYTES = 1_048_576;
const MAX_RUNTIME_CODE_BYTES = 1_048_576;
const HEX_BYTES = /^0x[0-9a-fA-F]*$/;

export type EvmFinalizedBlock = Readonly<{
  number: bigint;
  hash: Hex32;
  timestampSeconds: bigint;
}>;

/**
 * A source-checked transport bundle. It is still unsigned chain evidence:
 * callers must pass its receipts to the existing semantic binder and obtain
 * any independent observer/finality attestations separately.
 */
export type EvmFundingReceiptBundle = Readonly<{
  deploymentReceipt: StablecoinLockDeploymentReceipt;
  deploymentLogs: readonly EvmReceiptLog[];
  receipt: EvmFundingReceipt;
  finalizedBlock: EvmFinalizedBlock;
}>;

type RawRecord = Record<string, unknown>;

type NormalizedAuthority = Readonly<{
  address: HexAddress;
  transactionHash: Hex32;
  blockNumber: bigint;
  blockHash: Hex32;
  runtimeBytecodeSha256: Hex32;
  terms: ConditionalLockTerms;
}>;

type ParsedReceipt = Readonly<{
  transactionHash: Hex32;
  blockNumber: bigint;
  blockHash: Hex32;
  from: HexAddress;
  to: HexAddress | null;
  contractAddress: HexAddress | null;
  logs: readonly EvmReceiptLog[];
}>;

type ParsedTransaction = Readonly<{
  hash: Hex32;
  blockNumber: bigint;
  blockHash: Hex32;
  from: HexAddress;
  to: HexAddress | null;
  input: string;
  value: bigint;
}>;

function record(value: unknown, label: string): RawRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as RawRecord;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  return value;
}

function nonzeroAddress(value: unknown, label: string): HexAddress {
  const address = normalizeAddress(requiredString(value, label), label);
  if (address === ZERO_ADDRESS) throw new RangeError(`${label} cannot be zero`);
  return address;
}

function nonzeroHex32(value: unknown, label: string): Hex32 {
  const hash = normalizeHex32(requiredString(value, label), label);
  if (hash === ZERO_HEX32) throw new RangeError(`${label} cannot be zero`);
  return hash;
}

function quantity(value: unknown, label: string): bigint {
  const text = requiredString(value, label);
  if (text.length > 18 || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(text)) {
    throw new TypeError(`${label} must be a canonical hexadecimal quantity`);
  }
  const parsed = BigInt(text);
  assertUint(parsed, 64, label);
  return parsed;
}

function uint256Quantity(value: unknown, label: string): bigint {
  const text = requiredString(value, label);
  if (text.length > 66 || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(text)) {
    throw new TypeError(`${label} must be a canonical hexadecimal quantity`);
  }
  const parsed = BigInt(text);
  assertUint(parsed, 256, label);
  return parsed;
}

function quantityHex(value: bigint): string {
  assertUint(value, 64, "RPC block number");
  return `0x${value.toString(16)}`;
}

function assertMainnetChainId(value: unknown): void {
  const text = requiredString(value, "Ethereum chain ID");
  if (text.length > 18 || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(text)) {
    throw new Error("Ethereum Mainnet chain ID 1 is required");
  }
  assertEthereumMainnetChainId(text);
}

function hexBytes(value: unknown, label: string, maximumBytes: number, allowEmpty = true): string {
  const text = requiredString(value, label);
  if (text.length > 2 + maximumBytes * 2
    || (allowEmpty ? text.length < 2 : text.length < 4)
    || (text.length - 2) % 2 !== 0
    || !HEX_BYTES.test(text)) {
    throw new TypeError(`${label} must be bounded even-length hexadecimal bytes`);
  }
  return text.toLowerCase();
}

function sameBlock(left: EvmFinalizedBlock, right: EvmFinalizedBlock, label: string): void {
  if (left.number !== right.number || left.hash !== right.hash || left.timestampSeconds !== right.timestampSeconds) {
    throw new Error(`${label} changed during the read`);
  }
}

function parseBlock(value: unknown, label: string, expectedNumber?: bigint): EvmFinalizedBlock {
  const block = record(value, label);
  const number = quantity(block.number, `${label} number`);
  if (expectedNumber !== undefined && number !== expectedNumber) {
    throw new Error(`${label} number does not match the requested block`);
  }
  const hash = nonzeroHex32(block.hash, `${label} hash`);
  const timestampSeconds = quantity(block.timestamp, `${label} timestamp`);
  return Object.freeze({ number, hash, timestampSeconds });
}

function parseLog(
  value: unknown,
  receiptTransactionHash: Hex32,
  receiptBlockNumber: bigint,
  receiptBlockHash: Hex32,
  label: string,
  index: number,
): EvmReceiptLog {
  const log = record(value, `${label} log ${index}`);
  const transactionHash = normalizeHex32(
    requiredString(log.transactionHash, `${label} log ${index} transaction hash`),
    `${label} log ${index} transaction hash`,
  );
  const blockHash = normalizeHex32(
    requiredString(log.blockHash, `${label} log ${index} block hash`),
    `${label} log ${index} block hash`,
  );
  const blockNumber = quantity(log.blockNumber, `${label} log ${index} block number`);
  if (transactionHash !== receiptTransactionHash
    || blockNumber !== receiptBlockNumber
    || blockHash !== receiptBlockHash) {
    throw new Error(`${label} log ${index} does not identify its containing receipt`);
  }
  if (log.removed !== undefined && log.removed !== false) {
    throw new Error(`${label} log ${index} is removed`);
  }

  const address = normalizeAddress(
    requiredString(log.address, `${label} log ${index} address`),
    `${label} log ${index} address`,
  );
  const logIndex = quantity(log.logIndex, `${label} log ${index} index`);
  const topicsValue = log.topics;
  if (!Array.isArray(topicsValue) || topicsValue.length > 4) {
    throw new TypeError(`${label} log ${index} topics must contain at most four words`);
  }
  const topics = topicsValue.map((topic, topicIndex) => {
    if (typeof topic !== "string" || topic.length !== 66 || !HEX_BYTES.test(topic)) {
      throw new TypeError(`${label} log ${index} topic ${topicIndex} must be one ABI word`);
    }
    return topic.toLowerCase();
  });
  const data = hexBytes(log.data, `${label} log ${index} data`, MAX_RECEIPT_DATA_BYTES);
  return Object.freeze({
    address,
    logIndex,
    topics: Object.freeze(topics),
    data,
  });
}

function parseLogs(
  value: unknown,
  receiptTransactionHash: Hex32,
  receiptBlockNumber: bigint,
  receiptBlockHash: Hex32,
  label: string,
): readonly EvmReceiptLog[] {
  if (!Array.isArray(value) || value.length > MAX_RECEIPT_LOGS) {
    throw new RangeError(`${label} logs exceed the bounded receipt limit`);
  }
  const indexes = new Set<bigint>();
  let totalDataBytes = 0;
  const logs = value.map((raw, index) => {
    const log = parseLog(raw, receiptTransactionHash, receiptBlockNumber, receiptBlockHash, label, index);
    if (indexes.has(log.logIndex)) throw new Error(`${label} logs cannot reuse a log index`);
    indexes.add(log.logIndex);
    totalDataBytes += (log.data.length - 2) / 2;
    if (totalDataBytes > MAX_RECEIPT_DATA_BYTES) {
      throw new RangeError(`${label} log data exceeds the bounded receipt limit`);
    }
    return log;
  });
  return Object.freeze(logs);
}

function parseReceipt(value: unknown, label: string): ParsedReceipt {
  const receipt = record(value, label);
  const transactionHash = nonzeroHex32(receipt.transactionHash, `${label} transaction hash`);
  const blockNumber = quantity(receipt.blockNumber, `${label} block number`);
  const blockHash = nonzeroHex32(receipt.blockHash, `${label} block hash`);
  if (receipt.status !== "0x1") throw new Error(`${label} must report successful execution`);
  const from = nonzeroAddress(receipt.from, `${label} sender`);
  const to = receipt.to === null
    ? null
    : nonzeroAddress(receipt.to, `${label} recipient`);
  const contractAddress = receipt.contractAddress === null
    ? null
    : nonzeroAddress(receipt.contractAddress, `${label} contract address`);
  const logs = parseLogs(receipt.logs, transactionHash, blockNumber, blockHash, label);
  return Object.freeze({ transactionHash, blockNumber, blockHash, from, to, contractAddress, logs });
}

function parseTransaction(value: unknown, label: string): ParsedTransaction {
  const transaction = record(value, label);
  const hash = nonzeroHex32(transaction.hash, `${label} hash`);
  const blockNumber = quantity(transaction.blockNumber, `${label} block number`);
  const blockHash = nonzeroHex32(transaction.blockHash, `${label} block hash`);
  const from = nonzeroAddress(transaction.from, `${label} sender`);
  const to = transaction.to === null
    ? null
    : nonzeroAddress(transaction.to, `${label} recipient`);
  const input = hexBytes(transaction.input, `${label} input`, MAX_TRANSACTION_INPUT_BYTES, true);
  const valueQuantity = uint256Quantity(transaction.value, `${label} value`);
  return Object.freeze({ hash, blockNumber, blockHash, from, to, input, value: valueQuantity });
}

function normalizeAuthority(value: StablecoinLockDeploymentAuthority): NormalizedAuthority {
  const terms = decodeConditionalLockConstructorArgs(encodeConditionalLockConstructorArgs(value.terms));
  const blockNumber = value.blockNumber;
  assertUint(blockNumber, 64, "Approved deployment block number");
  if (blockNumber === 0n) throw new RangeError("Approved deployment block number must be positive");
  return Object.freeze({
    address: nonzeroAddress(value.address, "Approved deployment address"),
    transactionHash: nonzeroHex32(value.transactionHash, "Approved deployment transaction hash"),
    blockNumber,
    blockHash: nonzeroHex32(value.blockHash, "Approved deployment block hash"),
    runtimeBytecodeSha256: nonzeroHex32(value.runtimeBytecodeSha256, "Approved runtime bytecode SHA-256"),
    terms,
  });
}

function assertStateAuthority(state: SwapState, authority: NormalizedAuthority): void {
  const stateTerms = conditionalLockTermsForSwapState(state);
  const lock = nonzeroAddress(state.terms.evmEscrowContract, "Swap EVM escrow contract");
  if (lock !== authority.address
    || stateTerms.swapId !== authority.terms.swapId
    || stateTerms.termsHash !== authority.terms.termsHash
    || encodeConditionalLockConstructorArgs(stateTerms) !== encodeConditionalLockConstructorArgs(authority.terms)) {
    throw new Error("Approved deployment authority does not match the canonical swap terms");
  }
}

function assertReceiptAndTransactionIdentity(
  receipt: ParsedReceipt,
  transaction: ParsedTransaction,
  label: string,
): void {
  if (receipt.transactionHash !== transaction.hash
    || receipt.blockNumber !== transaction.blockNumber
    || receipt.blockHash !== transaction.blockHash
    || receipt.from !== transaction.from
    || receipt.to !== transaction.to) {
    throw new Error(`${label} receipt and transaction identities disagree`);
  }
}

function assertReceiptAtBlock(
  receipt: ParsedReceipt,
  block: EvmFinalizedBlock,
  label: string,
): void {
  if (receipt.blockNumber !== block.number || receipt.blockHash !== block.hash) {
    throw new Error(`${label} receipt is not in its queried block`);
  }
}

function assertAtOrBeforeFinalized(
  block: EvmFinalizedBlock,
  finalized: EvmFinalizedBlock,
  label: string,
): void {
  if (block.number > finalized.number || block.timestampSeconds > finalized.timestampSeconds) {
    throw new Error(`${label} is after the pinned finalized block`);
  }
  if (block.number === finalized.number
    && (block.hash !== finalized.hash || block.timestampSeconds !== finalized.timestampSeconds)) {
    throw new Error(`${label} block identity does not match the pinned finalized block`);
  }
  if (block.number < finalized.number && block.timestampSeconds >= finalized.timestampSeconds) {
    throw new Error(`${label} block timestamp does not precede the pinned finalized block`);
  }
}

function assertEvent(logs: readonly EvmReceiptLog[], topic: string, address: HexAddress, label: string): void {
  const matches = logs.filter((log) => log.address === address && log.topics[0] === topic);
  if (matches.length !== 1) throw new Error(`${label} must contain exactly one matching event`);
}

async function request(
  provider: StablecoinClaimReadProvider,
  method: string,
  params: unknown[],
): Promise<unknown> {
  return provider.request({ method, params });
}

/** Test seam; production callers must use readEvmFundingBundle's manifest gate. */
export async function readEvmFundingBundleWithAuthority(
  provider: StablecoinClaimReadProvider,
  state: SwapState,
  fundingTransactionHash: string,
  authorityValue: StablecoinLockDeploymentAuthority,
): Promise<EvmFundingReceiptBundle> {
  if (provider === null || typeof provider !== "object" || typeof provider.request !== "function") {
    throw new TypeError("EVM receipt source provider is unavailable");
  }

  // Validate and copy all caller-derived identity before the first await.
  const validatedState = assertSwapStateIntegrity(state);
  const authority = normalizeAuthority(authorityValue);
  const fundingHash = nonzeroHex32(fundingTransactionHash, "Funding transaction hash");
  if (fundingHash === authority.transactionHash) {
    throw new Error("Funding transaction must differ from the approved deployment transaction");
  }
  assertStateAuthority(validatedState, authority);

  const chainId = await request(provider, "eth_chainId", []);
  assertMainnetChainId(chainId);

  const finalizedBlock = parseBlock(
    await request(provider, "eth_getBlockByNumber", ["finalized", false]),
    "Finalized block",
  );
  if (finalizedBlock.number < authority.blockNumber) {
    throw new Error("Finalized block predates the approved deployment");
  }

  const deploymentReceipt = parseReceipt(
    await request(provider, "eth_getTransactionReceipt", [authority.transactionHash]),
    "Deployment receipt",
  );
  const deploymentTransaction = parseTransaction(
    await request(provider, "eth_getTransactionByHash", [authority.transactionHash]),
    "Deployment transaction",
  );
  assertReceiptAndTransactionIdentity(deploymentReceipt, deploymentTransaction, "Deployment");
  if (deploymentReceipt.transactionHash !== authority.transactionHash
    || deploymentReceipt.blockNumber !== authority.blockNumber
    || deploymentReceipt.blockHash !== authority.blockHash
    || deploymentReceipt.contractAddress !== authority.address
    || deploymentReceipt.to !== null
    || deploymentTransaction.to !== null) {
    throw new Error("Deployment receipt does not match the approved authority");
  }
  if (deploymentTransaction.value !== 0n) {
    throw new Error("Deployment transaction must carry zero native value");
  }
  // The existing authority stores no init-code hash; its manifest/source gate
  // supplies that approval while this path checks the constructor suffix.
  const constructorArgs = encodeConditionalLockConstructorArgs(authority.terms).slice(2).toLowerCase();
  if (!deploymentTransaction.input.slice(2).endsWith(constructorArgs)) {
    throw new Error("Deployment transaction input does not end with the approved constructor arguments");
  }
  const deploymentLogs = deploymentReceipt.logs;
  assertEvent(deploymentLogs, LOCK_CREATED_TOPIC, authority.address, "Deployment receipt");
  const deploymentBlock = parseBlock(
    await request(provider, "eth_getBlockByNumber", [quantityHex(deploymentReceipt.blockNumber), false]),
    "Deployment block",
    deploymentReceipt.blockNumber,
  );
  assertReceiptAtBlock(deploymentReceipt, deploymentBlock, "Deployment");
  assertAtOrBeforeFinalized(deploymentBlock, finalizedBlock, "Deployment");

  const receipt = parseReceipt(
    await request(provider, "eth_getTransactionReceipt", [fundingHash]),
    "Funding receipt",
  );
  const transaction = parseTransaction(
    await request(provider, "eth_getTransactionByHash", [fundingHash]),
    "Funding transaction",
  );
  assertReceiptAndTransactionIdentity(receipt, transaction, "Funding");
  if (receipt.transactionHash !== fundingHash
    || receipt.to !== authority.address
    || receipt.contractAddress !== null
    || transaction.to !== authority.address
    || transaction.from !== authority.terms.funder
    || transaction.input !== encodeFundCalldata()
    || transaction.value !== 0n) {
    throw new Error("Funding receipt and transaction do not match the approved lock fund call");
  }
  if (receipt.blockNumber <= deploymentReceipt.blockNumber) {
    throw new Error("Funding must be in a block after deployment");
  }
  const fundingBlock = parseBlock(
    await request(provider, "eth_getBlockByNumber", [quantityHex(receipt.blockNumber), false]),
    "Funding block",
    receipt.blockNumber,
  );
  assertReceiptAtBlock(receipt, fundingBlock, "Funding");
  assertAtOrBeforeFinalized(fundingBlock, finalizedBlock, "Funding");
  if (deploymentBlock.timestampSeconds >= fundingBlock.timestampSeconds) {
    throw new Error("Funding block timestamp must be after deployment block timestamp");
  }
  const fundingLogs = receipt.logs;
  assertEvent(fundingLogs, FUNDED_TOPIC, authority.address, "Funding receipt");

  const code = hexBytes(
    await request(provider, "eth_getCode", [authority.address, {
      blockHash: finalizedBlock.hash,
      requireCanonical: true,
    }]),
    "Finalized lock runtime bytecode",
    MAX_RUNTIME_CODE_BYTES,
    false,
  );
  if (sha256Hex(hexToBytes(code)) !== authority.runtimeBytecodeSha256) {
    throw new Error("Finalized lock runtime bytecode does not match the approved deployment");
  }

  const recheckedFinalizedBlock = parseBlock(
    await request(provider, "eth_getBlockByNumber", [quantityHex(finalizedBlock.number), false]),
    "Rechecked finalized block",
    finalizedBlock.number,
  );
  sameBlock(finalizedBlock, recheckedFinalizedBlock, "Finalized block");
  const finalChainId = await request(provider, "eth_chainId", []);
  assertMainnetChainId(finalChainId);

  const deploymentReceiptResult: StablecoinLockDeploymentReceipt = Object.freeze({
    chainId: ETHEREUM_MAINNET_CHAIN_HEX,
    address: authority.address,
    transactionHash: authority.transactionHash,
    blockNumber: deploymentReceipt.blockNumber,
    blockHash: deploymentReceipt.blockHash,
    receiptStatus: "0x1",
    runtimeBytecodeSha256: authority.runtimeBytecodeSha256,
  });
  const fundingReceiptResult: EvmFundingReceipt = Object.freeze({
    chainId: ETHEREUM_MAINNET_CHAIN_HEX,
    transactionHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    blockTimestampSeconds: fundingBlock.timestampSeconds,
    receiptStatus: "0x1",
    logs: fundingLogs,
  });
  return Object.freeze({
    deploymentReceipt: deploymentReceiptResult,
    deploymentLogs,
    receipt: fundingReceiptResult,
    finalizedBlock,
  });
}

/**
 * Production entry point. The tracked manifest is consulted before provider
 * validation or any provider request; its source/runtime/deployment checks
 * remain the authority boundary. No signing, broadcasting, journal mutation,
 * or finality attestation is performed here.
 */
export async function readEvmFundingBundle(
  provider: StablecoinClaimReadProvider,
  state: SwapState,
  fundingTransactionHash: string,
): Promise<EvmFundingReceiptBundle> {
  const authority = approvedDeploymentManifest();
  return readEvmFundingBundleWithAuthority(provider, state, fundingTransactionHash, authority);
}
