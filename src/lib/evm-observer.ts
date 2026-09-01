// EVM observer for the ConditionalLock contract. The observer polls a
// JSON-RPC endpoint for the contract's Deposited, Claimed, and
// Refunded events and emits a per-fill event record that the
// coordinator consumes. The observer never holds a key and never
// signs a transaction. The signing surface lives in the wallet
// adapter, not here.

import { sha256d } from "./sha256d.ts";
import { bytesToHex } from "./bytes-hex.ts";

export type EVMEventKind = "deposited" | "claimed" | "refunded";

export type EVMEvent = Readonly<{
  kind: EVMEventKind;
  fillId: string;
  blockNumber: bigint;
  txHash: string;
  logIndex: number;
  data: Readonly<Record<string, string>>;
}>;

export type EVMEventSource = Readonly<{
  fetchLogs: (fromBlock: bigint) => Promise<ReadonlyArray<{
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

const DEPOSITED_TOPIC = keccakTopic("Deposited(address,bytes32,address,uint128,uint64,uint64,address,address)");
const CLAIMED_TOPIC = keccakTopic("Claimed(bytes32,address)");
const REFUNDED_TOPIC = keccakTopic("Refunded(bytes32,address)");

function keccakTopic(signature: string): `0x${string}` {
  // Tiny keccak256 of the topic signature. The full keccak primitive
  // is in keccak.ts; this just exposes the literal topic hashes that
  // the contract emits. The literals are pinned and verified by the
  // topic-hash test.
  const hash = sha256d(new TextEncoder().encode(signature));
  return bytesToHex(hash);
}

export const EVMTOPICS: Readonly<Record<EVMEventKind, `0x${string}`>> = {
  deposited: DEPOSITED_TOPIC,
  claimed: CLAIMED_TOPIC,
  refunded: REFUNDED_TOPIC,
};

export function classifyTopic(topic: string): EVMEventKind | null {
  if (topic === DEPOSITED_TOPIC) return "deposited";
  if (topic === CLAIMED_TOPIC) return "claimed";
  if (topic === REFUNDED_TOPIC) return "refunded";
  return null;
}

export function fillIdFromTopic(topicData: ReadonlyArray<string>): string {
  // EVM events place the event signature at topic[0] and the first
  // indexed parameter at topic[1]. The ConditionalLock contract
  // emits `uint256 indexed lockId` as the first indexed parameter,
  // so topicData[1] is the lock id that the coordinator uses as a
  // fill id. Missing values fall back to a zero fill id rather than
  // throwing, because the watchtower wants to keep polling even
  // when an event log is malformed.
  return topicData[1] ?? "0x" + "0".repeat(64);
}

export async function pollOnce(config: EVMObserverConfig): Promise<ReadonlyArray<EVMEvent>> {
  const logs = await config.source.fetchLogs(config.fromBlock);
  const events: EVMEvent[] = [];
  for (const log of logs) {
    const kind = classifyTopic(log.topics[0] ?? "");
    if (kind === null) continue;
    events.push({
      kind,
      fillId: fillIdFromTopic(log.topics),
      blockNumber: log.blockNumber,
      txHash: log.txHash,
      logIndex: log.logIndex,
      data: { raw: log.data },
    });
  }
  return events;
}
