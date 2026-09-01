import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  classifyTopic,
  EVMTOPICS,
  fillIdFromTopic,
  pollOnce,
  type EVMEventSource,
} from "./evm-observer.ts";

test("classifyTopic recognizes the three event kinds", () => {
  assert.equal(classifyTopic(EVMTOPICS.deposited), "deposited");
  assert.equal(classifyTopic(EVMTOPICS.claimed), "claimed");
  assert.equal(classifyTopic(EVMTOPICS.refunded), "refunded");
});

test("classifyTopic returns null for an unknown topic", () => {
  assert.equal(classifyTopic("0x" + "ab".repeat(32)), null);
  assert.equal(classifyTopic(""), null);
});

test("fillIdFromTopic reads the first indexed parameter", () => {
  // EVM events put the signature at topic[0] and the first indexed
  // parameter at topic[1]. ConditionalLock emits uint256 indexed
  // lockId as the first indexed parameter, so the fill id is
  // topicData[1].
  assert.equal(fillIdFromTopic(["0x" + "ff".repeat(32), "0x" + "ab".repeat(32), "0x" + "00".repeat(32)]), "0x" + "ab".repeat(32));
});

test("fillIdFromTopic returns zero when the topic array has no indexed parameter", () => {
  assert.equal(fillIdFromTopic(["0x" + "ff".repeat(32)]), "0x" + "0".repeat(64));
});

test("pollOnce returns no events for an empty source", async () => {
  const source: EVMEventSource = { fetchLogs: async () => [] };
  const events = await pollOnce({ contractAddress: "0x" + "00".repeat(20), fromBlock: 0n, source });
  assert.equal(events.length, 0);
});

test("pollOnce emits one event per matching log", async () => {
  const source: EVMEventSource = {
    fetchLogs: async () => [
      {
        blockNumber: 100n,
        txHash: "0x" + "11".repeat(32),
        logIndex: 0,
        topics: [EVMTOPICS.deposited, "0x" + "ab".repeat(32), "0x" + "00".repeat(20)],
        data: "0x",
      },
      {
        blockNumber: 101n,
        txHash: "0x" + "22".repeat(32),
        logIndex: 0,
        topics: [EVMTOPICS.claimed, "0x" + "ab".repeat(32), "0x" + "00".repeat(20)],
        data: "0x",
      },
    ],
  };
  const events = await pollOnce({ contractAddress: "0x" + "00".repeat(20), fromBlock: 100n, source });
  assert.equal(events.length, 2);
  assert.equal(events[0].kind, "deposited");
  assert.equal(events[0].blockNumber, 100n);
  assert.equal(events[0].fillId, "0x" + "ab".repeat(32));
  assert.equal(events[1].kind, "claimed");
  assert.equal(events[1].blockNumber, 101n);
  assert.equal(events[1].fillId, "0x" + "ab".repeat(32));
});

test("pollOnce ignores logs that do not match any event kind", async () => {
  const source: EVMEventSource = {
    fetchLogs: async () => [
      {
        blockNumber: 100n,
        txHash: "0x" + "11".repeat(32),
        logIndex: 0,
        topics: ["0x" + "ff".repeat(32)],
        data: "0x",
      },
    ],
  };
  const events = await pollOnce({ contractAddress: "0x" + "00".repeat(20), fromBlock: 100n, source });
  assert.equal(events.length, 0);
});
