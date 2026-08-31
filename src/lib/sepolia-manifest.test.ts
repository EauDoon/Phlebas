import assert from "node:assert/strict";
import test from "node:test";

import { emptyManifest, recordBroadcast } from "./sepolia-manifest.ts";

const address = (digit: number) => `0x${digit.toString(16).repeat(40)}`;
const TX = `0x${"ab".repeat(32)}`;

function completeBroadcast() {
  return {
    chain: 421614,
    receipts: [{ transactionHash: TX, status: "0x1" }],
    transactions: [
      { contractName: "Zec", contractAddress: address(1), hash: TX, transactionType: "CREATE" },
      { contractName: "QuoteToken", contractAddress: address(2), transactionType: "CREATE" },
      { contractName: "QuoteToken", contractAddress: address(3), transactionType: "CREATE" },
      { contractName: "Factory", contractAddress: address(4), transactionType: "CREATE" },
      { contractName: "Pair", contractAddress: address(5), transactionType: "CREATE" },
      { contractName: "Pair", contractAddress: address(6), transactionType: "CREATE" },
      { contractName: "Router", contractAddress: address(7), transactionType: "CREATE" },
      { contractName: "Settlement", contractAddress: address(8), transactionType: "CREATE" },
    ],
  };
}

function completeCode() {
  return Object.fromEntries(Array.from({ length: 8 }, (_, index) => [address(index + 1), "0x6000"]));
}

test("recording a broadcast never sets deployed without an explicit mark", () => {
  const recorded = recordBroadcast(emptyManifest(), {
    chain: 421614,
    transactions: [
      { contractName: "Zec", contractAddress: address(1), hash: TX, transactionType: "CREATE" },
    ],
  });
  assert.equal(recorded.deployed, false);
  assert.equal(recorded.contracts.Zec, address(1));
  assert.equal(recorded.broadcastTx, TX);
});

test("mark-deployed requires a complete broadcast, commit, and Sepolia chain id", () => {
  assert.throws(() => recordBroadcast(emptyManifest(), { chain: 421614, transactions: [] }, { markDeployed: true }), /transaction hash/);
  assert.throws(() => recordBroadcast(emptyManifest(), { chain: 1, transactions: [] }), /421614/);
  assert.throws(() => recordBroadcast(emptyManifest("deadbeef"), {
    chain: 421614,
    transactions: [{ contractName: "Zec", contractAddress: address(1), hash: TX, transactionType: "CREATE" }],
  }, { markDeployed: true, commit: "deadbeef" }), /every contract/);
  assert.throws(
    () => recordBroadcast(emptyManifest(), completeBroadcast(), { markDeployed: true, deployedCode: completeCode() }),
    /git commit/,
  );
  assert.throws(
    () => recordBroadcast(emptyManifest("deadbeef"), { ...completeBroadcast(), receipts: [] }, {
      markDeployed: true,
      commit: "deadbeef",
      deployedCode: completeCode(),
    }),
    /successful Sepolia receipt/,
  );
  assert.throws(
    () => recordBroadcast(emptyManifest("deadbeef"), completeBroadcast(), {
      markDeployed: true,
      commit: "deadbeef",
      deployedCode: { ...completeCode(), [address(8)]: "0x" },
    }),
    /verified bytecode/,
  );
  const marked = recordBroadcast(emptyManifest("deadbeef"), completeBroadcast(), {
    markDeployed: true,
    commit: "deadbeef",
    deployedCode: completeCode(),
  });
  assert.equal(marked.deployed, true);
  assert.equal(marked.commit, "deadbeef");
  assert.equal(marked.contracts.TUsdt, address(3));
  assert.equal(marked.contracts.ZecUsdtPair, address(6));
});
