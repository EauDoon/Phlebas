import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm, unlink } from "node:fs/promises";
import type { Server } from "node:http";
import { createConnection, type AddressInfo, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createOrderDomain, hashOrderDomain, type TypedOrderIntent } from "../../src/lib/eip712-order.ts";
import { keccak256Text } from "../../src/lib/keccak.ts";
import type { MatcherSignatureVerifier } from "../../src/lib/matcher-auth.ts";
import type { PersistentMatcherConfiguration, PersistentMatcherEvent } from "../../src/lib/persistent-matcher.ts";
import { accountIdentifier, adapterIdentifier, assetIdentifier, chainIdentifier } from "../../src/lib/order-domain.ts";
import { VENUE_CLOB } from "../../src/lib/order-policy.ts";
import { serializePersistentMatcherEvent } from "./persistent-store.ts";
import { startMatcher } from "./server.ts";

const now = 1_800_000_000n;
const domain = createOrderDomain(42161n, "0x1111111111111111111111111111111111111111");
const baseNetwork = "bip122:00040fe8ec8471911baa1db1266ea15d";
const baseAsset = `${baseNetwork}/slip44:133`;
const quoteNetwork = "eip155:42161";
const quoteAsset = `${quoteNetwork}/erc20:0xaf88d065e77c8cc2239327c5edb3a432268e5831`;
const protocol = "transparent-htlc-v1";
const configuration: PersistentMatcherConfiguration = {
  domain,
  atomicSwapPolicy: {
    orderDomain: domain,
    pair: {
      base: { network: baseNetwork, asset: baseAsset, environment: "mainnet", decimals: 8 },
      quote: { network: quoteNetwork, asset: quoteAsset, environment: "mainnet", decimals: 6 },
    },
    settlementProtocolVersion: protocol,
    stablecoinRefundDelaySeconds: 3_600n,
    zcashRefundSafetyDeltaSeconds: 7_200n,
    zcashRequiredConfirmations: 10,
    quoteRequiredConfirmations: 65,
  },
  solverQuotePolicy: {
    matcherDomainHash: hashOrderDomain(domain),
    baseNetwork,
    baseAsset,
    quoteNetwork,
    quoteAsset,
    settlementProtocolVersion: protocol,
    maximumCapacityBaseAtoms: 10_000_000_000n,
    maximumLifetimeSeconds: 10_000n,
  },
  maximumOrderLifetimeSeconds: 10_000n,
  limits: {
    minimumBaseAmountAtoms: 1n,
    maximumBaseAmountAtoms: 10_000_000_000n,
    maximumAcceptedOrders: 1_000,
    maximumOpenOrders: 100,
    maximumOpenOrdersPerAccount: 10,
    maximumSolverQuotes: 100,
    maximumRouteFills: 16,
    maximumSolverFills: 8,
  },
};
const verifier: MatcherSignatureVerifier = { verify() {} };

function zcashAccount(name: string): string {
  const address = `t3${keccak256Text(`zcash:${name}`).slice(2).replaceAll("0", "a").slice(0, 33)}`;
  return `zcash:mainnet:${address}`;
}

function event(requestId = "order-one", nonce = 1n): Extract<PersistentMatcherEvent, { kind: "accept-order" }> {
  const suffix = nonce.toString();
  const sourceAccount = zcashAccount(`maker:${suffix}`);
  const recipientAccount = `${quoteNetwork}:0x1111111111111111111111111111111111111111`;
  const order: TypedOrderIntent = {
    makerAccountId: accountIdentifier(sourceAccount),
    authorizedSignerId: accountIdentifier(`${quoteNetwork}:signer-${suffix}`),
    recipientAccountId: accountIdentifier(recipientAccount),
    baseChainId: chainIdentifier(baseNetwork),
    baseAssetId: assetIdentifier(baseAsset),
    quoteChainId: chainIdentifier(quoteNetwork),
    quoteAssetId: assetIdentifier(quoteAsset),
    side: 1,
    baseAmountAtoms: 100_000_000n,
    limitPriceTicks: 5_000n,
    nonce,
    accountEpoch: 0n,
    expiry: now + 5_000n,
    salt: keccak256Text(`server-order-${suffix}`),
    timeInForce: 0,
    maximumFeeBps: 30n,
    allowedVenues: VENUE_CLOB,
    settlementAdapterId: adapterIdentifier(protocol),
  };
  return {
    version: 1,
    requestId,
    occurredAtSeconds: now,
    kind: "accept-order",
    submission: { order, signature: "signed-order", accounts: { sourceAccount, recipientAccount } },
  };
}

function payload(value: PersistentMatcherEvent): unknown {
  return serializePersistentMatcherEvent(configuration, value).payload;
}

async function listen(server: Server): Promise<string> {
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  assert.equal(address.address, "127.0.0.1");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error?: Error) => error ? reject(error) : resolve()));
}

async function socketClosed(socket: Socket): Promise<void> {
  if (socket.destroyed) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("timed out waiting for slow request to close"));
    }, 2_000);
    socket.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("error", () => undefined);
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

test("starts loopback-only in an honest unconfigured no-value mode", async () => {
  const server = startMatcher({ host: "127.0.0.1", port: 0 });
  const origin = await listen(server);
  try {
    const health = await fetch(`${origin}/health`);
    const body = await json(health);
    assert.equal(health.status, 200);
    assert.equal(body.matcher, "persistent-native-v1");
    assert.equal(body.configured, false);
    assert.equal(body.acceptingMutations, false);
    assert.equal(body.mode, "no-value");
    assert.equal(body.custody, false);
    assert.equal((await fetch(`${origin}/v1/sequence`)).status, 503);
    assert.equal((await fetch(`${origin}/v1/orders`, { method: "POST" })).status, 503);
  } finally {
    await close(server);
  }
});

test("persists idempotent v1 intake and publishes checkpoint-bound feeds", async () => {
  const directory = await mkdtemp(join(tmpdir(), "phlebas-matcher-http-"));
  let server = startMatcher({ host: "127.0.0.1", port: 0, dataDirectory: directory, configuration, verifier, clockSeconds: () => now });
  let origin = await listen(server);
  try {
    const first = await fetch(`${origin}/v1/orders`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "order-one" },
      body: JSON.stringify(payload(event())),
    });
    assert.equal(first.status, 201);
    const firstBody = await json(first);
    assert.equal(firstBody.replayed, false);

    const replay = await fetch(`${origin}/v1/orders`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "order-one" },
      body: JSON.stringify(payload(event())),
    });
    assert.equal(replay.status, 200);
    assert.equal((await json(replay)).replayed, true);

    const health = await json(await fetch(`${origin}/health`));
    assert.equal(health.sequence, "1");
    assert.match(String(health.stateRoot), /^0x[0-9a-f]{64}$/);
    const sequence = await json(await fetch(`${origin}/v1/sequence?after=0&limit=1`));
    assert.equal(sequence.nextAfter, "1");
    assert.equal(sequence.hasMore, false);
    assert.equal((sequence.receipts as unknown[]).length, 1);
    const receipt = await fetch(`${origin}/v1/requests/order-one`);
    assert.equal(receipt.status, 200);
    const book = await json(await fetch(`${origin}/v1/market/book`));
    assert.equal(((book.book as { asks: unknown[] }).asks).length, 1);
    assert.equal((await fetch(`${origin}/v1/checkpoint`)).status, 200);
    assert.equal((await fetch(`${origin}/v1/executions?after=1`)).status, 200);
    await close(server);

    server = startMatcher({ host: "127.0.0.1", port: 0, dataDirectory: directory, configuration, verifier, clockSeconds: () => now });
    origin = await listen(server);
    assert.equal((await json(await fetch(`${origin}/health`))).sequence, "1");
  } finally {
    if (server.listening) await close(server);
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects ambiguous endpoints, idempotency mismatch, media type, and oversized bodies", async () => {
  const directory = await mkdtemp(join(tmpdir(), "phlebas-matcher-abuse-"));
  const server = startMatcher({
    host: "127.0.0.1",
    port: 0,
    dataDirectory: directory,
    configuration,
    verifier,
    maximumBodyBytes: 2_048,
  });
  const origin = await listen(server);
  try {
    const wrongKind = await fetch(`${origin}/v1/solver-quotes`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "order-one" },
      body: JSON.stringify(payload(event())),
    });
    assert.equal(wrongKind.status, 400);
    const wrongKey = await fetch(`${origin}/v1/orders`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "different" },
      body: JSON.stringify(payload(event())),
    });
    assert.equal(wrongKey.status, 400);
    assert.equal((await fetch(`${origin}/v1/orders`, { method: "POST", body: "{}" })).status, 415);
    const duplicate = await fetch(`${origin}/v1/orders`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "duplicate" },
      body: '{"kind":"accept-order","kind":"cancel-order"}',
    });
    assert.equal(duplicate.status, 400);
    assert.match(String((await json(duplicate)).reason), /invalid-json/);
    const oversized = await fetch(`${origin}/v1/orders`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "large" },
      body: JSON.stringify({ value: "x".repeat(3_000) }),
    });
    assert.equal(oversized.status, 413);
    assert.equal((await fetch(`${origin}/v1/sequence?after=01`)).status, 400);
    assert.equal((await fetch(`${origin}/v1/sequence?limit=101`)).status, 400);
    assert.equal((await fetch(`${origin}/v1/requests/missing`)).status, 404);
  } finally {
    await close(server);
    await rm(directory, { recursive: true, force: true });
  }
});

test("times out and destroys partial mutation bodies without consuming the pending slot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "phlebas-matcher-slowloris-"));
  const server = startMatcher({
    host: "127.0.0.1",
    port: 0,
    dataDirectory: directory,
    configuration,
    verifier,
    maximumPendingMutations: 1,
    bodyReadTimeoutMilliseconds: 50,
    clockSeconds: () => now,
  });
  const origin = await listen(server);
  const address = new URL(origin);
  const socket = createConnection(Number(address.port), "127.0.0.1");
  try {
    await once(socket, "connect");
    const closed = socketClosed(socket);
    socket.write([
      "POST /v1/orders HTTP/1.1",
      "Host: 127.0.0.1",
      "Content-Type: application/json",
      "Idempotency-Key: slowloris",
      "Content-Length: 20",
      "Connection: close",
      "",
      "{\"",
    ].join("\r\n"));
    await closed;

    const recovered = await fetch(`${origin}/v1/orders`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "after-slowloris" },
      body: JSON.stringify(payload(event("after-slowloris"))),
    });
    assert.equal(recovered.status, 201);
  } finally {
    socket.destroy();
    await close(server);
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects mutation events outside the trusted server clock skew", async () => {
  const directory = await mkdtemp(join(tmpdir(), "phlebas-matcher-clock-"));
  const server = startMatcher({
    host: "127.0.0.1",
    port: 0,
    dataDirectory: directory,
    configuration,
    verifier,
    clockSeconds: () => now,
  });
  const origin = await listen(server);
  try {
    const response = await fetch(`${origin}/v1/orders`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "future-server" },
      body: JSON.stringify(payload({ ...event("future-server"), occurredAtSeconds: now + 31n })),
    });
    assert.equal(response.status, 400);
    assert.match(String((await json(response)).reason), /too far in the future/);
  } finally {
    await close(server);
    await rm(directory, { recursive: true, force: true });
  }
});

test("reports a faulted store as unavailable and rejects future mutations", async () => {
  const directory = await mkdtemp(join(tmpdir(), "phlebas-matcher-fault-"));
  let server = startMatcher({
    host: "127.0.0.1",
    port: 0,
    dataDirectory: directory,
    configuration,
    verifier,
    maximumJournalRecords: 1,
    clockSeconds: () => now,
  });
  let origin = await listen(server);
  try {
    assert.equal((await fetch(`${origin}/v1/orders`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "fault-one" },
      body: JSON.stringify(payload(event("fault-one"))),
    })).status, 201);
    const failed = await fetch(`${origin}/v1/orders`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "fault-two" },
      body: JSON.stringify(payload(event("fault-two", 2n))),
    });
    assert.equal(failed.status, 503);
    assert.match(String((await json(failed)).reason), /persistence-unavailable/);
    const health = await fetch(`${origin}/health`);
    assert.equal(health.status, 503);
    const healthBody = await json(health);
    assert.equal(healthBody.acceptingMutations, false);
    assert.match(String(healthBody.reason), /persistence-unavailable/);
    await close(server);

    server = startMatcher({
      host: "127.0.0.1",
      port: 0,
      dataDirectory: directory,
      configuration,
      verifier,
      maximumJournalRecords: 10,
      clockSeconds: () => now,
    });
    origin = await listen(server);
    assert.equal((await json(await fetch(`${origin}/health`))).sequence, "1");
  } finally {
    if (server.listening) await close(server);
    await rm(directory, { recursive: true, force: true });
  }
});

test("fails closed on a second writer and missing initialized journal", async () => {
  const directory = await mkdtemp(join(tmpdir(), "phlebas-matcher-lock-"));
  let first = startMatcher({ host: "127.0.0.1", port: 0, dataDirectory: directory, configuration, verifier });
  const firstOrigin = await listen(first);
  assert.equal((await fetch(`${firstOrigin}/health`)).status, 200);
  const second = startMatcher({ host: "127.0.0.1", port: 0, dataDirectory: directory, configuration, verifier });
  const secondOrigin = await listen(second);
  try {
    const locked = await fetch(`${secondOrigin}/health`);
    assert.equal(locked.status, 503);
    assert.match(String((await json(locked)).reason), /writer lock already exists/);
  } finally {
    await close(second);
    await close(first);
  }

  await unlink(join(directory, "events.jsonl"));
  first = startMatcher({ host: "127.0.0.1", port: 0, dataDirectory: directory, configuration, verifier });
  const missingOrigin = await listen(first);
  try {
    const missing = await fetch(`${missingOrigin}/health`);
    assert.equal(missing.status, 503);
    assert.match(String((await json(missing)).reason), /persistence is missing/);
  } finally {
    await close(first);
    await rm(directory, { recursive: true, force: true });
  }
});

test("enforces mutation rate and queue admission before sequencing", async () => {
  const rateDirectory = await mkdtemp(join(tmpdir(), "phlebas-matcher-rate-"));
  const rateServer = startMatcher({
    host: "127.0.0.1",
    port: 0,
    dataDirectory: rateDirectory,
    configuration,
    verifier,
    mutationRateLimit: 1,
  });
  const rateOrigin = await listen(rateServer);
  try {
    assert.equal((await fetch(`${rateOrigin}/v1/orders`, { method: "POST" })).status, 415);
    const limited = await fetch(`${rateOrigin}/v1/orders`, { method: "POST" });
    assert.equal(limited.status, 429);
    assert.equal((await json(limited)).reason, "mutation-rate-limit-exceeded");
  } finally {
    await close(rateServer);
    await rm(rateDirectory, { recursive: true, force: true });
  }

  const queueDirectory = await mkdtemp(join(tmpdir(), "phlebas-matcher-queue-"));
  const queueServer = startMatcher({
    host: "127.0.0.1",
    port: 0,
    dataDirectory: queueDirectory,
    configuration,
    verifier,
    maximumPendingMutations: 1,
    clockSeconds: () => now,
  });
  const queueOrigin = await listen(queueServer);
  try {
    const requests = Array.from({ length: 8 }, () => fetch(`${queueOrigin}/v1/orders`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "order-one" },
      body: JSON.stringify(payload(event())),
    }));
    const responses = await Promise.all(requests);
    assert.equal(responses.some((response) => response.status === 201), true);
    assert.equal(responses.some((response) => response.status === 503), true);
    assert.equal((await json(await fetch(`${queueOrigin}/health`))).sequence, "1");
  } finally {
    await close(queueServer);
    await rm(queueDirectory, { recursive: true, force: true });
  }
});
