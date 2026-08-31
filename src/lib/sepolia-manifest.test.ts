import assert from "node:assert/strict";
import test from "node:test";

import { emptyManifest, recordBroadcast } from "./sepolia-manifest.ts";

const PZED = "0x1111111111111111111111111111111111111111";
const TX = `0x${"ab".repeat(32)}`;

test("recording a broadcast never sets deployed without an explicit mark", () => {
  const recorded = recordBroadcast(emptyManifest(), {
    chain: 421614,
    transactions: [
      { contractName: "PZec", contractAddress: PZED, hash: TX, transactionType: "CREATE" },
    ],
  });
  assert.equal(recorded.deployed, false);
  assert.equal(recorded.contracts.PZec, PZED);
  assert.equal(recorded.broadcastTx, TX);
});

test("mark-deployed requires a real tx hash and Sepolia chain id", () => {
  assert.throws(() => recordBroadcast(emptyManifest(), { chain: 421614, transactions: [] }, { markDeployed: true }), /transaction hash/);
  assert.throws(() => recordBroadcast(emptyManifest(), { chain: 1, transactions: [] }), /421614/);
  const marked = recordBroadcast(emptyManifest("deadbeef"), {
    chain: 421614,
    transactions: [{ contractName: "Settlement", contractAddress: PZED, hash: TX }],
  }, { markDeployed: true, commit: "deadbeef" });
  assert.equal(marked.deployed, true);
  assert.equal(marked.commit, "deadbeef");
});
