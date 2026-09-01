import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  classifyTopic,
  EVMTOPICS,
  fillIdFromTopic,
  pollOnce,
  type EVMEventSource,
} from "./evm-observer.ts";

const CONTRACT = `0x${"12".repeat(20)}`;
const OTHER_CONTRACT = `0x${"34".repeat(20)}`;
const FILL = `0x${"ab".repeat(32)}`;
const FUNDED_TOPIC = "0x72684aa74a58c3501fe65eec4ae1b61d5c12bcb5aae4b47ab0b56842b112f20b";
const CLAIMED_TOPIC = "0x0508a8b4117d9a7b3d8f5895f6413e61b4f9a2df35afbfb41e78d0ecfff1843f";
const REFUNDED_TOPIC = "0xf552ca82e113ac3c539c3d617f29fcd19c172a0c75dad017555c9e109f7fe183";

test("event topics match the current ConditionalLock ABI", () => {
  assert.equal(EVMTOPICS.funded, FUNDED_TOPIC);
  assert.equal(EVMTOPICS.claimed, CLAIMED_TOPIC);
  assert.equal(EVMTOPICS.refunded, REFUNDED_TOPIC);
  assert.equal(classifyTopic(FUNDED_TOPIC.toUpperCase().replace("0X", "0x")), "funded");
  assert.equal(classifyTopic(CLAIMED_TOPIC), "claimed");
  assert.equal(classifyTopic(REFUNDED_TOPIC), "refunded");
});

test("classifyTopic returns null for an unknown topic", () => {
  assert.equal(classifyTopic(`0x${"cd".repeat(32)}`), null);
  assert.equal(classifyTopic(""), null);
});

test("fillIdFromTopic requires a valid indexed bytes32 swap id", () => {
  assert.equal(fillIdFromTopic([FUNDED_TOPIC, FILL, `0x${"00".repeat(32)}`]), FILL);
  assert.equal(fillIdFromTopic([FUNDED_TOPIC]), null);
  assert.equal(fillIdFromTopic([FUNDED_TOPIC, "0x01"]), null);
});

test("pollOnce passes the exact contract filter to an empty source", async () => {
  let requestedAddress = "";
  const source: EVMEventSource = {
    fetchLogs: async (_fromBlock, contractAddress) => {
      requestedAddress = contractAddress;
      return [];
    },
  };
  const events = await pollOnce({ contractAddress: CONTRACT.toUpperCase().replace("0X", "0x"), fromBlock: 0n, source });
  assert.equal(events.length, 0);
  assert.equal(requestedAddress, CONTRACT);
});

test("pollOnce emits current ABI events only from the configured contract", async () => {
  const source: EVMEventSource = {
    fetchLogs: async () => [
      {
        address: CONTRACT,
        blockNumber: 100n,
        txHash: `0x${"11".repeat(32)}`,
        logIndex: 0,
        topics: [FUNDED_TOPIC, FILL, `0x${"00".repeat(32)}`],
        data: "0x",
      },
      {
        address: CONTRACT,
        blockNumber: 101n,
        txHash: `0x${"22".repeat(32)}`,
        logIndex: 0,
        topics: [CLAIMED_TOPIC, FILL, `0x${"00".repeat(32)}`],
        data: "0x",
      },
      {
        address: OTHER_CONTRACT,
        blockNumber: 102n,
        txHash: `0x${"33".repeat(32)}`,
        logIndex: 0,
        topics: [REFUNDED_TOPIC, FILL, `0x${"00".repeat(32)}`],
        data: "0x",
      },
    ],
  };
  const events = await pollOnce({ contractAddress: CONTRACT, fromBlock: 100n, source });
  assert.deepEqual(events.map(({ kind, blockNumber, fillId }) => ({ kind, blockNumber, fillId })), [
    { kind: "funded", blockNumber: 100n, fillId: FILL },
    { kind: "claimed", blockNumber: 101n, fillId: FILL },
  ]);
});

test("pollOnce ignores unknown events and malformed indexed topics", async () => {
  const source: EVMEventSource = {
    fetchLogs: async () => [
      {
        address: CONTRACT,
        blockNumber: 100n,
        txHash: `0x${"11".repeat(32)}`,
        logIndex: 0,
        topics: [`0x${"ff".repeat(32)}`, FILL],
        data: "0x",
      },
      {
        address: CONTRACT,
        blockNumber: 101n,
        txHash: `0x${"22".repeat(32)}`,
        logIndex: 0,
        topics: [FUNDED_TOPIC],
        data: "0x",
      },
    ],
  };
  assert.deepEqual(await pollOnce({ contractAddress: CONTRACT, fromBlock: 100n, source }), []);
});

test("pollOnce rejects a zero or malformed contract address before polling", async () => {
  const source: EVMEventSource = { fetchLogs: async () => [] };
  await assert.rejects(
    pollOnce({ contractAddress: `0x${"0".repeat(40)}`, fromBlock: 0n, source }),
    /nonzero 20-byte address/,
  );
  await assert.rejects(
    pollOnce({ contractAddress: "0x1234", fromBlock: 0n, source }),
    /nonzero 20-byte address/,
  );
});
