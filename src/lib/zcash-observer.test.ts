import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  pollZcashOnce,
  type ZcashEventSource,
} from "./zcash-observer.ts";

function makeSource(rows: Array<{ txid: string; vout: number; amountZatoshis: bigint; blockHeight: bigint; spent: boolean }>): ZcashEventSource {
  return {
    fetchAddressOutpoints: async () => rows.map((r) => ({ txid: r.txid, vout: r.vout, amountZatoshis: r.amountZatoshis, blockHeight: r.blockHeight })),
    fetchSpend: async (txid, vout) => {
      const row = rows.find((r) => r.txid === txid && r.vout === vout);
      return { spent: row?.spent ?? false, spendTxid: row?.spent ? "ab".repeat(32) : null };
    },
  };
}

test("pollZcashOnce emits a funded event for an unspent outpoint", async () => {
  const source = makeSource([
    { txid: "ab".repeat(32), vout: 0, amountZatoshis: 100_000n, blockHeight: 100n, spent: false },
  ]);
  const events = await pollZcashOnce({
    addresses: ["t2abc"],
    fromHeight: 0n,
    source,
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "funded");
  assert.equal(events[0].amountZatoshis, 100_000n);
});

test("pollZcashOnce emits a claimed event for a recent spend", async () => {
  const source = makeSource([
    { txid: "ab".repeat(32), vout: 0, amountZatoshis: 100_000n, blockHeight: 200n, spent: true },
  ]);
  const events = await pollZcashOnce({
    addresses: ["t2abc"],
    fromHeight: 195n,
    source,
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "claimed");
});

test("pollZcashOnce emits a refunded event for an old spend", async () => {
  const source = makeSource([
    { txid: "ab".repeat(32), vout: 0, amountZatoshis: 100_000n, blockHeight: 100n, spent: true },
  ]);
  const events = await pollZcashOnce({
    addresses: ["t2abc"],
    fromHeight: 200n,
    source,
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "refunded");
});

test("pollZcashOnce aggregates across addresses", async () => {
  const source: ZcashEventSource = {
    fetchAddressOutpoints: async (address) => {
      if (address === "t2abc") return [{ txid: "ab".repeat(32), vout: 0, amountZatoshis: 1n, blockHeight: 100n }];
      if (address === "t2def") return [{ txid: "cd".repeat(32), vout: 0, amountZatoshis: 2n, blockHeight: 200n }];
      return [];
    },
    fetchSpend: async () => ({ spent: false, spendTxid: null }),
  };
  const events = await pollZcashOnce({
    addresses: ["t2abc", "t2def"],
    fromHeight: 0n,
    source,
  });
  assert.equal(events.length, 2);
});
