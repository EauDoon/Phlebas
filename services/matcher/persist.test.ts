import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sepoliaDomain } from "../../src/lib/eip712.ts";
import { createMatcherOperator, intakeSignedOrder, sequenceRoot } from "../../src/lib/matcher-operator.ts";
import { atomicWriteFile } from "../durable-file.ts";
import { readOperator, writeOperator } from "./persist.ts";

const ZERO = "0x0000000000000000000000000000000000000000";
const MAKER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

test("persisted operator reloads the same sequence and book", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phlebas-matcher-"));
  const path = join(dir, "state.json");
  try {
    const operator = createMatcherOperator(sepoliaDomain(ZERO), 5291n, {
      baseAsset: "0x0000000000000000000000000000000000000001",
      quoteAssets: ["0x0000000000000000000000000000000000000002"],
    });
    intakeSignedOrder(operator, {
      maker: MAKER,
      side: 0,
      baseAsset: "0x0000000000000000000000000000000000000001",
      quoteAsset: "0x0000000000000000000000000000000000000002",
      baseAmount: 100_000_000n,
      limitPriceTicks: 5291n,
      timeInForce: 0,
      nonce: 1n,
      accountEpoch: 0n,
      expiry: 0n,
      salt: 1n,
      recipient: MAKER,
      maximumFeeBps: 30,
      allowedVenues: 1,
      tif: "GTC",
      signature: "0x25dda9696a4eed8b907e5b9fcb79f39169284f1c544f992627af993faa4a61e63c69c69b68a6306e970377cdcb9af0bb1dac6cd4f223f2fbba034c06682651091b",
    });
    await writeOperator(path, operator);
    const loaded = await readOperator(path);
    assert.ok(loaded);
    assert.equal(loaded?.sequence, 1);
    assert.equal(loaded?.book.lastTicks, operator.book.lastTicks);
    assert.equal(loaded?.receipts[0]?.digest, operator.receipts[0]?.digest);
    assert.equal(loaded?.baseAsset, operator.baseAsset);
    assert.deepEqual(loaded?.quoteAssets, operator.quoteAssets);
    assert.equal(sequenceRoot(loaded), sequenceRoot(operator));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("corrupt persist file fails closed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phlebas-matcher-corrupt-"));
  const path = join(dir, "state.json");
  try {
    await writeFile(path, "{not-json");
    await assert.rejects(() => readOperator(path), /JSON/);
    await writeFile(path, JSON.stringify({ sequence: "nope" }));
    await assert.rejects(() => readOperator(path));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("tampered sequence root fails closed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phlebas-matcher-root-"));
  const path = join(dir, "state.json");
  try {
    const operator = createMatcherOperator(sepoliaDomain(ZERO), 5291n);
    intakeSignedOrder(operator, {
      maker: MAKER,
      side: 0,
      baseAsset: "0x0000000000000000000000000000000000000001",
      quoteAsset: "0x0000000000000000000000000000000000000002",
      baseAmount: 100_000_000n,
      limitPriceTicks: 5291n,
      nonce: 1n,
      accountEpoch: 0n,
      expiry: 0n,
      salt: 1n,
      recipient: MAKER,
      maximumFeeBps: 30,
      allowedVenues: 1,
      timeInForce: 0,
      tif: "GTC",
      signature: "0x25dda9696a4eed8b907e5b9fcb79f39169284f1c544f992627af993faa4a61e63c69c69b68a6306e970377cdcb9af0bb1dac6cd4f223f2fbba034c06682651091b",
    });
    await writeOperator(path, operator);
    const snapshot = JSON.parse(await readFile(path, "utf8")) as { sequenceRoot: string };
    snapshot.sequenceRoot = "00".repeat(32);
    await writeFile(path, `${JSON.stringify(snapshot)}\n`);
    await assert.rejects(() => readOperator(path), /sequence root/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("durable checkpoint writes survive a concurrent reader of the same path", async () => {
  // Windows will not rename a file over a destination some other handle has open
  // without FILE_SHARE_DELETE, and Node's readFile does not request that share mode.
  // Without a retry, a health check or backup tool polling the operator snapshot at
  // the exact moment a write lands used to turn a harmless race into a hard failure
  // (and, in the persistent store, a latched persistence fault) even though the
  // fully written temp file was sitting there intact the whole time. This drives a
  // concurrent reader against the same path atomicWriteFile is rewriting and asserts
  // every write still lands.
  const dir = await mkdtemp(join(tmpdir(), "phlebas-durable-race-"));
  const path = join(dir, "state.json");
  try {
    await writeFile(path, "seed-0\n");
    let stop = false;
    const reader = (async () => {
      while (!stop) {
        await readFile(path, "utf8").catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    })();
    try {
      for (let i = 1; i <= 20; i += 1) {
        await atomicWriteFile(path, `seed-${i}\n`);
      }
    } finally {
      stop = true;
      await reader;
    }
    assert.equal(await readFile(path, "utf8"), "seed-20\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
