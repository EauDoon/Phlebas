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
  const address = server.address() as AddressInfo;
  assert.equal(address.address, "127.0.0.1");
  const { port } = address;
  try {
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    const healthBody = await health.json() as { network: string; zebra: string; confirmations: number };
    assert.equal(health.ok, true);
    assert.equal(healthBody.network, "testnet");
    assert.equal(healthBody.zebra, "stub");
    assert.equal(healthBody.confirmations, 10);
    const missing = await fetch(`http://127.0.0.1:${port}/nope`);
    assert.equal(missing.status, 404);

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
    const firstBody = await first.json() as { status: string; amountZatoshis: string; outpointKey: string; tex: string; confirmationsRequired: number };
    assert.equal(first.status, 200);
    assert.equal(firstBody.status, "eligible");
    assert.equal(firstBody.confirmationsRequired, 10);
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

test("observer HTTP quarantines shielded payments and fails closed on disagreement", async () => {
  const server = startObserver({ host: "127.0.0.1", port: 0 });
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const base = {
    txid: "55".repeat(32),
    vout: 0,
    amountZatoshis: "1",
    tex: TEX,
    blockHeight: 10,
    blockHash: "66".repeat(32),
    tipHeight: 19,
  };
  try {
    const shielded = await fetch(`http://127.0.0.1:${port}/attest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...base, shieldedBundle: true }),
    });
    const shieldedBody = await shielded.json() as { status: string };
    assert.equal(shieldedBody.status, "quarantined");

    const disagreement = await fetch(`http://127.0.0.1:${port}/attest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        observations: [base, { ...base, amountZatoshis: "2" }],
      }),
    });
    const disagreementBody = await disagreement.json() as { reason: string };
    assert.equal(disagreement.status, 400);
    assert.match(disagreementBody.reason, /disagreement/);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("observer HTTP coverage stub reproduces reserve coverage from public inputs", async () => {
  const server = startObserver({ host: "127.0.0.1", port: 0 });
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const payload = {
    controlledAssets: "1011",
    tokenSupply: "900",
    depositEntitlements: "0",
    withdrawalClaims: [{
      claimId: "wd-1",
      transactionId: "",
      payable: "100",
      status: "payable",
      selectedInput: "0",
      inTransitPrincipal: "0",
      inFlightChange: "0",
      networkFee: "0",
    }],
    committedTransactionIds: [],
    otherLiabilities: "0",
    requiredBuffer: "10",
  };
  try {
    const covered = await fetch(`http://127.0.0.1:${port}/coverage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const coveredBody = await covered.json() as { coverage: { controlledCovered: boolean; controlledRequirement: string } };
    assert.equal(covered.status, 200);
    assert.equal(coveredBody.coverage.controlledCovered, true);
    assert.equal(coveredBody.coverage.controlledRequirement, "1010");

    const deficit = await fetch(`http://127.0.0.1:${port}/coverage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, controlledAssets: "1000" }),
    });
    const deficitBody = await deficit.json() as { coverage: { controlledCovered: boolean } };
    assert.equal(deficit.status, 200);
    assert.equal(deficitBody.coverage.controlledCovered, false);

    const blocked = await fetch(`http://127.0.0.1:${port}/attest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        txid: "77".repeat(32),
        vout: 0,
        amountZatoshis: "1",
        tex: TEX,
        blockHeight: 10,
        blockHash: "88".repeat(32),
        tipHeight: 19,
        reserve: { ...payload, controlledAssets: "1000" },
      }),
    });
    const blockedBody = await blocked.json() as { reason: string };
    assert.equal(blocked.status, 400);
    assert.equal(blockedBody.reason, "reserve-uncovered");
  } finally {
    server.close();
    await once(server, "close");
  }
});
