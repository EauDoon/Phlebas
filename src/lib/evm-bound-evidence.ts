import {
  decodeConditionalLockCreatedLog,
  encodeConditionalLockConstructorArgs,
  FUNDED_EVENT_SIGNATURE,
  LOCK_CREATED_EVENT_SIGNATURE,
  type ConditionalLockTerms,
} from "./conditional-lock-abi.ts";
import {
  assertEthereumMainnetChainId,
  ETHEREUM_MAINNET_CHAIN_HEX,
  ETHEREUM_MAINNET_NETWORK,
  ETHEREUM_MAINNET_USDC_ADDRESS,
  ETHEREUM_MAINNET_USDC_ASSET,
  ETHEREUM_MAINNET_USDT_ADDRESS,
  ETHEREUM_MAINNET_USDT_ASSET,
  NATIVE_ZEC_ASSET,
  ZCASH_MAINNET_NETWORK,
} from "./mainnet-assets.ts";
import { assertUint, normalizeAddress, normalizeHex32, type Hex32 } from "./order-domain.ts";
import {
  assertSwapStateIntegrity,
  fundingFactId,
  type FundingFact,
  type SwapState,
} from "./swap-state.ts";
import type { StablecoinLockDeploymentReceipt } from "./stablecoin-wallet-action.ts";

// This binds caller-supplied receipt evidence to canonical terms. It does not
// verify participant signatures or prove inclusion, finality, source approval, or authority.
export type EvmReceiptLog = Readonly<{
  address: string;
  logIndex: bigint;
  topics: readonly string[];
  data: string;
}>;

export type EvmFundingReceipt = Readonly<{
  chainId: typeof ETHEREUM_MAINNET_CHAIN_HEX;
  transactionHash: string;
  blockNumber: bigint;
  blockHash: string;
  blockTimestampSeconds: bigint;
  receiptStatus: "0x1";
  logs: readonly EvmReceiptLog[];
}>;

// ponytail: linear receipt scans are bounded to 1,024 logs; use indexed source queries if this ceiling proves too low.
const MAX_RECEIPT_LOGS = 1_024;
const ZERO_HEX32 = `0x${"00".repeat(32)}`;
const LOCK_CREATED_TOPIC = `0x${LOCK_CREATED_EVENT_SIGNATURE}`;
const FUNDED_TOPIC = `0x${FUNDED_EVENT_SIGNATURE}`;
const ADDRESS_WORD = /^0x0{24}[0-9a-f]{40}$/;
const ABI_WORD = /^0x[0-9a-f]{64}$/;
const HEX_BYTES = /^0x[0-9a-f]*$/;
const MAX_RECEIPT_DATA_BYTES = 1_048_576;

function nonzeroHex32(value: string, label: string): Hex32 {
  const normalized = normalizeHex32(value, label);
  if (normalized === ZERO_HEX32) throw new RangeError(`${label} cannot be zero`);
  return normalized;
}

function nonzeroAddress(value: string, label: string): `0x${string}` {
  const normalized = normalizeAddress(value, label);
  if (normalized === `0x${"00".repeat(20)}`) throw new RangeError(`${label} cannot be zero`);
  return normalized;
}

function uint64(value: bigint, label: string, allowZero = false): bigint {
  assertUint(value, 64, label);
  if (!allowZero && value === 0n) throw new RangeError(`${label} must be positive`);
  return value;
}

function validateLogs(logs: readonly EvmReceiptLog[], label: string): EvmReceiptLog[] {
  if (!Array.isArray(logs)) throw new TypeError(`${label} logs must be an array`);
  if (logs.length > MAX_RECEIPT_LOGS) throw new RangeError(`${label} logs exceed the bounded receipt limit`);

  const indexes = new Set<bigint>();
  let totalDataBytes = 0;
  return logs.map((log, index) => {
    if (log === null || typeof log !== "object" || Array.isArray(log)) {
      throw new TypeError(`${label} log ${index} must be an object`);
    }
    if (typeof log.address !== "string" || log.address.length !== 42) {
      throw new TypeError(`${label} log ${index} address must be one EVM address`);
    }
    const address = normalizeAddress(log.address, `${label} log ${index} address`);
    const logIndex = uint64(log.logIndex, `${label} log ${index} index`, true);
    if (indexes.has(logIndex)) throw new Error(`${label} logs cannot reuse a log index`);
    indexes.add(logIndex);
    const rawTopics: unknown = log.topics;
    if (!Array.isArray(rawTopics) || rawTopics.length > 4) {
      throw new TypeError(`${label} log ${index} topics must contain at most four words`);
    }
    const topics = (rawTopics as readonly unknown[]).map((topic: unknown, topicIndex: number) => {
      if (typeof topic !== "string" || topic.length !== 66 || !ABI_WORD.test(topic.toLowerCase())) {
        throw new TypeError(`${label} log ${index} topic ${topicIndex} must be one ABI word`);
      }
      return topic.toLowerCase();
    });
    if (typeof log.data !== "string" || log.data.length < 2 || (log.data.length - 2) % 2 !== 0
      || log.data.length > 2 + MAX_RECEIPT_DATA_BYTES * 2) {
      throw new TypeError(`${label} log ${index} data must be even-length hexadecimal bytes`);
    }
    const dataBytes = (log.data.length - 2) / 2;
    if (totalDataBytes + dataBytes > MAX_RECEIPT_DATA_BYTES) {
      throw new RangeError(`${label} log data exceeds the bounded receipt limit`);
    }
    totalDataBytes += dataBytes;
    if (!HEX_BYTES.test(log.data.toLowerCase())) {
      throw new TypeError(`${label} log ${index} data must be even-length hexadecimal bytes`);
    }
    return Object.freeze({ address, logIndex, topics: Object.freeze(topics), data: log.data.toLowerCase() });
  });
}

function expectedTerms(state: SwapState): ConditionalLockTerms {
  const terms = state.terms;
  if (terms.zecChain !== ZCASH_MAINNET_NETWORK || terms.zecAsset !== NATIVE_ZEC_ASSET) {
    throw new Error("EVM funding requires the exact Zcash Mainnet native ZEC market");
  }
  if (terms.quoteChain !== ETHEREUM_MAINNET_NETWORK) {
    throw new Error("EVM funding requires the exact Ethereum Mainnet quote chain");
  }

  let token: string;
  if (terms.quoteAsset === ETHEREUM_MAINNET_USDC_ASSET) token = ETHEREUM_MAINNET_USDC_ADDRESS;
  else if (terms.quoteAsset === ETHEREUM_MAINNET_USDT_ASSET) token = ETHEREUM_MAINNET_USDT_ADDRESS;
  else throw new Error("EVM funding requires the exact Ethereum Mainnet USDC or USDT asset");
  if (terms.protocolFeeQuoteAtoms !== 0n) throw new Error("EVM funding requires zero protocol fees");

  const conditionalTerms: ConditionalLockTerms = {
    swapId: state.swapId,
    termsHash: state.termsHash,
    token,
    funder: terms.evmFunder,
    claimRecipient: terms.evmClaimRecipient,
    refundRecipient: terms.evmRefundRecipient,
    amount: terms.quoteAmountAtoms,
    hashlock: terms.secretHash,
    fundingCutoff: terms.evmFundBy,
    claimCutoff: terms.evmClaimSafetyCutoff,
    refundTime: terms.evmRefundTime,
  };
  return conditionalTerms;
}

function decodeFundedLog(log: EvmReceiptLog, terms: ConditionalLockTerms): void {
  if (log.topics.length !== 4) throw new RangeError("Funded event must contain exactly four topics");
  if (log.data.length !== 66 || !ABI_WORD.test(log.data)) {
    throw new RangeError("Funded event must contain exactly one uint256 data word");
  }
  const swapId = nonzeroHex32(log.topics[1]!, "Funded swap ID");
  const funderWord = log.topics[2]!;
  const tokenWord = log.topics[3]!;
  if (!ADDRESS_WORD.test(funderWord)) throw new RangeError("Funded funder topic must be zero-left-padded");
  if (!ADDRESS_WORD.test(tokenWord)) throw new RangeError("Funded token topic must be zero-left-padded");
  const funder = nonzeroAddress(`0x${funderWord.slice(26)}`, "Funded funder");
  const token = nonzeroAddress(`0x${tokenWord.slice(26)}`, "Funded token");
  const amount = BigInt(log.data);
  if (swapId !== terms.swapId || funder !== terms.funder || token !== terms.token || amount !== terms.amount) {
    throw new Error("Funded event does not match the canonical conditional lock terms");
  }
}

export function bindEvmFundingReceipt(
  state: SwapState,
  deploymentReceipt: StablecoinLockDeploymentReceipt,
  deploymentLogs: readonly EvmReceiptLog[],
  receipt: EvmFundingReceipt,
): FundingFact {
  const canonicalState = assertSwapStateIntegrity(state);
  const terms = expectedTerms(canonicalState);
  // The encoder is the existing authority for the contract's 11-term invariants.
  const encodedExpectedTerms = encodeConditionalLockConstructorArgs(terms);

  assertEthereumMainnetChainId(deploymentReceipt.chainId);
  if (deploymentReceipt.receiptStatus !== "0x1") {
    throw new Error("Deployment receipt must report successful Ethereum Mainnet execution");
  }
  const lock = nonzeroAddress(deploymentReceipt.address, "Deployment receipt address");
  const deploymentTransactionHash = nonzeroHex32(
    deploymentReceipt.transactionHash,
    "Deployment transaction hash",
  );
  const deploymentBlockHash = nonzeroHex32(deploymentReceipt.blockHash, "Deployment block hash");
  const deploymentBlockNumber = uint64(deploymentReceipt.blockNumber, "Deployment block number");
  // This field is an existing deployment-record identity; source and runtime verification remain external.
  nonzeroHex32(deploymentReceipt.runtimeBytecodeSha256, "Deployment runtime bytecode SHA-256");
  if (lock !== canonicalState.terms.evmEscrowContract) {
    throw new Error("Deployment receipt address does not match the canonical escrow contract");
  }

  const normalizedDeploymentLogs = validateLogs(deploymentLogs, "Deployment receipt");
  let createdTerms: ConditionalLockTerms | undefined;
  for (const log of normalizedDeploymentLogs) {
    if (log.address !== lock || log.topics[0] !== LOCK_CREATED_TOPIC) continue;
    if (createdTerms) throw new Error("Deployment receipt contains ambiguous LockCreated events");
    createdTerms = decodeConditionalLockCreatedLog(log.topics, log.data);
  }
  if (!createdTerms) throw new Error("Deployment receipt is missing the lock-bound LockCreated event");
  if (encodeConditionalLockConstructorArgs(createdTerms) !== encodedExpectedTerms) {
    throw new Error("LockCreated terms do not match the canonical conditional lock terms");
  }

  if (!Array.isArray(receipt.logs)) throw new TypeError("Funding receipt logs must be an array");
  assertEthereumMainnetChainId(receipt.chainId);
  if (receipt.receiptStatus !== "0x1") throw new Error("Funding receipt must report successful execution");
  const transactionHash = nonzeroHex32(receipt.transactionHash, "Funding transaction hash");
  const blockHash = nonzeroHex32(receipt.blockHash, "Funding block hash");
  const blockNumber = uint64(receipt.blockNumber, "Funding block number");
  const blockTimestampSeconds = uint64(receipt.blockTimestampSeconds, "Funding block timestamp");
  // Same-block funding is intentionally unsupported; this adapter orders receipts by block height.
  if (blockNumber <= deploymentBlockNumber) {
    throw new Error("Funding receipt must be in a later block than deployment");
  }
  if (transactionHash === deploymentTransactionHash || transactionHash === deploymentBlockHash
    || blockHash === deploymentTransactionHash || blockHash === deploymentBlockHash) {
    throw new Error("Funding receipt reuses a deployment transaction or block identity");
  }
  if (blockTimestampSeconds > canonicalState.terms.evmFundBy) {
    throw new Error("Funding receipt occurred after the canonical EVM funding cutoff");
  }

  const normalizedReceiptLogs = validateLogs(receipt.logs, "Funding receipt");
  let fundedLog: EvmReceiptLog | undefined;
  for (const log of normalizedReceiptLogs) {
    if (log.address !== lock || log.topics[0] !== FUNDED_TOPIC) continue;
    if (fundedLog) throw new Error("Funding receipt contains ambiguous Funded events");
    decodeFundedLog(log, terms);
    fundedLog = log;
  }
  if (!fundedLog) throw new Error("Funding receipt is missing the lock-bound Funded event");

  const unsigned: Omit<FundingFact, "factId"> = {
    leg: "evm",
    swapId: canonicalState.swapId,
    termsHash: canonicalState.termsHash,
    transactionId: transactionHash,
    blockHash,
    blockHeight: blockNumber,
    executedAtSeconds: blockTimestampSeconds,
    outputIndex: fundedLog.logIndex,
    chain: canonicalState.terms.quoteChain,
    asset: canonicalState.terms.quoteAsset,
    amountAtoms: terms.amount,
    lockIdentity: lock,
    escrowRecordId: canonicalState.swapId,
    funder: terms.funder,
    claimRecipient: terms.claimRecipient,
    refundRecipient: terms.refundRecipient,
    secretHash: canonicalState.terms.secretHash,
    refundTime: terms.refundTime,
    successful: true,
  };
  return Object.freeze({ factId: fundingFactId(unsigned), ...unsigned });
}
