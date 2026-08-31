import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sepoliaDomain } from "../../src/lib/eip712.ts";
import { createMatcherOperator, intakeSignedOrder } from "../../src/lib/matcher-operator.ts";
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

    await writeFile(path, "{broken", "utf8");
    await assert.rejects(() => readOperator(path), /JSON/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
