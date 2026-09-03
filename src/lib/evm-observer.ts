// Diagnostic ConditionalLock log decoder. ABI validity does not establish
// receipt success, immutable contract terms, canonical inclusion, or finality.
// These records cannot become canonical swap evidence without those checks.

import {
  CLAIMED_EVENT_SIGNATURE,
  FUNDED_EVENT_SIGNATURE,
  REFUNDED_EVENT_SIGNATURE,
} from "./conditional-lock-abi.ts";

export type EVMEventKind = "funded" | "claimed" | "refunded";

export type EVMEvent = Readonly<{
  kind: EVMEventKind;
  fillId: string;
  blockNumber: bigint;
  txHash: string;
  logIndex: number;
  data: Readonly<Record<string, string>>;
}>;

export type EVMEventSource = Readonly<{
  fetchLogs: (fromBlock: bigint, contractAddress: string) => Promise<ReadonlyArray<{
    address: string;
    blockNumber: bigint;
    txHash: string;
    logIndex: number;
    topics: ReadonlyArray<string>;
    data: string;
  }>>;
}>;

export type EVMObserverConfig = Readonly<{
  contractAddress: string;
  fromBlock: bigint;
  source: EVMEventSource;
}>;

const FUNDED_TOPIC = `0x${FUNDED_EVENT_SIGNATURE}` as const;
const CLAIMED_TOPIC = `0x${CLAIMED_EVENT_SIGNATURE}` as const;
const REFUNDED_TOPIC = `0x${REFUNDED_EVENT_SIGNATURE}` as const;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const ZERO_ADDRESS = `0x${"0".repeat(40)}`;
const ZERO_WORD = `0x${"0".repeat(64)}`;

export const EVMTOPICS: Readonly<Record<EVMEventKind, `0x${string}`>> = {
  funded: FUNDED_TOPIC,
  claimed: CLAIMED_TOPIC,
  refunded: REFUNDED_TOPIC,
};

export function classifyTopic(topic: string): EVMEventKind | null {
  const normalized = topic.toLowerCase();
  if (normalized === FUNDED_TOPIC) return "funded";
  if (normalized === CLAIMED_TOPIC) return "claimed";
  if (normalized === REFUNDED_TOPIC) return "refunded";
  return null;
}

export function fillIdFromTopic(topicData: ReadonlyArray<string>): string | null {
  // EVM events place the event signature at topic[0] and the first
  // indexed parameter at topic[1]. The ConditionalLock contract
  // emits `bytes32 indexed swapId` first. A malformed or missing
  // indexed value is ignored so it cannot create a synthetic fill.
  const fillId = topicData[1];
  return fillId && BYTES32_PATTERN.test(fillId) && fillId !== ZERO_WORD ? fillId.toLowerCase() : null;
}

function indexedAddress(word: string): string | null {
  if (!/^0x0{24}[0-9a-fA-F]{40}$/.test(word)) return null;
  const address = `0x${word.slice(26).toLowerCase()}`;
  return address === ZERO_ADDRESS ? null : address;
}

function decodeEventData(kind: EVMEventKind, topics: readonly string[], raw: string): EVMEvent["data"] | null {
  if (topics.length !== (kind === "funded" ? 4 : 3) || !BYTES32_PATTERN.test(raw)) return null;
  const recipient = indexedAddress(topics[2]);
  const amount = BigInt(raw);
  if (!recipient || amount === 0n) return null;
  if (kind === "funded") {
    const token = indexedAddress(topics[3]);
    return token ? Object.freeze({ raw, funder: recipient, token, amountAtoms: amount.toString() }) : null;
  }
  return Object.freeze({ raw, recipient, amountAtoms: amount.toString() });
}

export async function pollOnce(config: EVMObserverConfig): Promise<ReadonlyArray<EVMEvent>> {
  if (!ADDRESS_PATTERN.test(config.contractAddress) || config.contractAddress.toLowerCase() === ZERO_ADDRESS) {
    throw new RangeError("ConditionalLock contract address must be a nonzero 20-byte address");
  }
  if (typeof config.fromBlock !== "bigint" || config.fromBlock < 0n) {
    throw new RangeError("Observer start block must be a nonnegative bigint");
  }
  const contractAddress = config.contractAddress.toLowerCase();
  const logs = await config.source.fetchLogs(config.fromBlock, contractAddress);
  const events: EVMEvent[] = [];
  for (const log of logs) {
    if (!ADDRESS_PATTERN.test(log.address) || log.address.toLowerCase() !== contractAddress) continue;
    if (typeof log.blockNumber !== "bigint" || log.blockNumber < config.fromBlock
      || !BYTES32_PATTERN.test(log.txHash) || log.txHash === ZERO_WORD
      || !Number.isSafeInteger(log.logIndex) || log.logIndex < 0) continue;
    const kind = classifyTopic(log.topics[0] ?? "");
    if (kind === null) continue;
    const fillId = fillIdFromTopic(log.topics);
    if (fillId === null) continue;
    const data = decodeEventData(kind, log.topics, log.data);
    if (data === null) continue;
    events.push(Object.freeze({
      kind,
      fillId,
      blockNumber: log.blockNumber,
      txHash: log.txHash.toLowerCase(),
      logIndex: log.logIndex,
      data,
    }));
  }
  return Object.freeze(events);
}
