// EVM observer for the ConditionalLock contract. The observer polls a
// JSON-RPC endpoint for the contract's Funded, Claimed, and
// Refunded events and emits a per-fill event record that the
// coordinator consumes. The observer never holds a key and never
// signs a transaction. The signing surface lives in the wallet
// adapter, not here.

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
  return fillId && BYTES32_PATTERN.test(fillId) ? fillId.toLowerCase() : null;
}

export async function pollOnce(config: EVMObserverConfig): Promise<ReadonlyArray<EVMEvent>> {
  if (!ADDRESS_PATTERN.test(config.contractAddress) || config.contractAddress.toLowerCase() === ZERO_ADDRESS) {
    throw new RangeError("ConditionalLock contract address must be a nonzero 20-byte address");
  }
  const contractAddress = config.contractAddress.toLowerCase();
  const logs = await config.source.fetchLogs(config.fromBlock, contractAddress);
  const events: EVMEvent[] = [];
  for (const log of logs) {
    if (!ADDRESS_PATTERN.test(log.address) || log.address.toLowerCase() !== contractAddress) continue;
    const kind = classifyTopic(log.topics[0] ?? "");
    if (kind === null) continue;
    const fillId = fillIdFromTopic(log.topics);
    if (fillId === null) continue;
    events.push({
      kind,
      fillId,
      blockNumber: log.blockNumber,
      txHash: log.txHash,
      logIndex: log.logIndex,
      data: { raw: log.data },
    });
  }
  return events;
}
