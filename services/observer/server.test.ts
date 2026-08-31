import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import type { AddressInfo } from "node:net";

import { hexToBytes } from "../../src/lib/keccak.ts";
import { encodeTex } from "../../src/lib/tex.ts";

import { startObserver } from "./server.ts";

const TEX = encodeTex(hexToBytes("00112233445566778899aabbccddeeff00112233"));
const TXID = "33".repeat(32);

test("observer HTTP stub attests a textest outpoint and refuses a second mint", async () => {
  const server = startObserver({ host: "127.0.0.1", port: 0 });
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  try {
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    const healthBody = await health.json() as { network: string; zebra: string };
    assert.equal(health.ok, true);
    assert.equal(healthBody.network, "testnet");
    assert.equal(healthBody.zebra, "stub");

    const payload = {
      txid: TXID,
      vout: 1,
      amountZatoshis: "100000000",
      tex: TEX,
      blockHeight: 50,
      blockHash: "44".repeat(32),
      tipHeight: 59,
    };
    const first = await fetch(`http://127.0.0.1:${port}/attest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const firstBody = await first.json() as { status: string; amountZatoshis: string; outpointKey: string; tex: string };
    assert.equal(first.status, 200);
    assert.equal(firstBody.status, "eligible");
    assert.equal(firstBody.amountZatoshis, payload.amountZatoshis);
    assert.equal(firstBody.outpointKey, `${TXID}:1`);
    assert.equal(firstBody.tex, TEX);

    const second = await fetch(`http://127.0.0.1:${port}/attest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const secondBody = await second.json() as { status: string; reason: string };
    assert.equal(secondBody.status, "rejected");
    assert.match(secondBody.reason, /already authorized/);
  } finally {
    server.close();
    await once(server, "close");
  }
});
