import assert from "node:assert/strict";
import { appendFile, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { TypedOrderIntent } from "../../src/lib/eip712-order.ts";
import { createOrderDomain, hashOrderDomain } from "../../src/lib/eip712-order.ts";
import { keccak256Text } from "../../src/lib/keccak.ts";
import type { MatcherSignatureVerifier } from "../../src/lib/matcher-auth.ts";
import { matcherStateRoot, type PersistentMatcherConfiguration, type PersistentMatcherEvent } from "../../src/lib/persistent-matcher.ts";
import { accountIdentifier, adapterIdentifier, assetIdentifier, chainIdentifier } from "../../src/lib/order-domain.ts";
import { VENUE_CLOB } from "../../src/lib/order-policy.ts";
import { canonicalJournalJson, type JournalCheckpoint } from "./journal.ts";
import {
  PersistentMatcherStore,
  deserializePersistentMatcherEvent,
  serializePersistentMatcherEvent,
} from "./persistent-store.ts";

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

function orderEvent(requestId: string, nonce: bigint): Extract<PersistentMatcherEvent, { kind: "accept-order" }> {
  const sourceAccount = `zcash:mainnet:t3-maker-${nonce}`;
  const recipientAccount = `${quoteNetwork}:0x${nonce.toString(16).padStart(40, "0")}`;
  const order: TypedOrderIntent = {
    makerAccountId: accountIdentifier(sourceAccount),
    authorizedSignerId: accountIdentifier(`${quoteNetwork}:signer-${nonce}`),
    recipientAccountId: accountIdentifier(recipientAccount),
    baseChainId: chainIdentifier(baseNetwork),
    baseAssetId: assetIdentifier(baseAsset),
    quoteChainId: chainIdentifier(quoteNetwork),
    quoteAssetId: assetIdentifier(quoteAsset),
    side: 1,
    baseAmountAtoms: 100n,
    limitPriceTicks: 5_000n + nonce,
    nonce,
    accountEpoch: 0n,
    expiry: now + 5_000n,
    salt: keccak256Text(`store-test:${nonce}`),
    timeInForce: 0,
    maximumFeeBps: 30n,
    allowedVenues: VENUE_CLOB,
    settlementAdapterId: adapterIdentifier(protocol),
  };
  return {
    version: 1,
    requestId,
    occurredAtSeconds: now + nonce,
    kind: "accept-order",
    submission: {
      order,
      signature: `signature:${requestId}`,
      accounts: { sourceAccount, recipientAccount },
    },
  };
}

function paths(directory: string) {
  return {
    journalPath: join(directory, "events.jsonl"),
    checkpointPath: join(directory, "checkpoint.json"),
    markerPath: join(directory, "initialized"),
    lockPath: join(directory, "writer.lock"),
    configuration,
    verifier,
  };
}

async function withDirectory(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "phlebas-store-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("round-trips the exact persisted event representation", () => {
  const event = orderEvent("round-trip", 1n);
  const serialized = serializePersistentMatcherEvent(configuration, event);
  assert.deepEqual(deserializePersistentMatcherEvent(configuration, serialized), event);
  assert.throws(
    () => deserializePersistentMatcherEvent(configuration, { ...serialized, ignored: true }),
    /missing or unsupported fields/,
  );
});

test("restarts with an identical state root and idempotent receipt", async () => {
  await withDirectory(async (directory) => {
    const options = paths(directory);
    let store = await PersistentMatcherStore.open(options);
    const event = orderEvent("idempotent", 1n);
    const first = await store.mutate(event);
    const repeated = await store.mutate(event);
    assert.equal(first.replayed, false);
    assert.equal(repeated.replayed, true);
    assert.equal(repeated.receipt.sequence, first.receipt.sequence);
    assert.equal(store.journal.sequence, 1n);
    const root = matcherStateRoot(store.state);
    await store.close();

    store = await PersistentMatcherStore.open(options);
    assert.equal(store.journal.sequence, 1n);
    assert.equal(matcherStateRoot(store.state), root);
    assert.equal(store.checkpoint.stateRoot, root);
    await store.close();
  });
});

test("linearizes concurrent mutations into contiguous durable sequences", async () => {
  await withDirectory(async (directory) => {
    const store = await PersistentMatcherStore.open(paths(directory));
    const results = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      store.mutate(orderEvent(`concurrent-${index}`, BigInt(index + 1)))));
    assert.deepEqual(results.map((result) => result.receipt.sequence), Array.from({ length: 12 }, (_, index) => BigInt(index + 1)));
    assert.equal(store.journal.sequence, 12n);
    assert.equal(store.checkpoint.sequence, "12");
    await store.close();
  });
});

test("fails closed when a second writer or stale lock is present", async () => {
  await withDirectory(async (directory) => {
    const options = paths(directory);
    const first = await PersistentMatcherStore.open(options);
    await assert.rejects(() => PersistentMatcherStore.open(options), /writer lock already exists/);
    await first.close();
    const recovered = await PersistentMatcherStore.open(options);
    await recovered.close();
  });
});

test("rejects checkpoint state-root tampering", async () => {
  await withDirectory(async (directory) => {
    const options = paths(directory);
    const store = await PersistentMatcherStore.open(options);
    await store.mutate(orderEvent("tamper", 1n));
    await store.close();
    const checkpoint = JSON.parse(await readFile(options.checkpointPath, "utf8")) as JournalCheckpoint;
    await writeFile(options.checkpointPath, `${canonicalJournalJson({ ...checkpoint, stateRoot: keccak256Text("tampered") })}\n`);
    await assert.rejects(() => PersistentMatcherStore.open(options), /state root does not match replay/);
  });
});

test("replays a valid stale checkpoint to the journal head", async () => {
  await withDirectory(async (directory) => {
    const options = paths(directory);
    let store = await PersistentMatcherStore.open(options);
    await store.mutate(orderEvent("one", 1n));
    const staleCheckpoint = store.checkpoint;
    await store.mutate(orderEvent("two", 2n));
    const finalRoot = matcherStateRoot(store.state);
    await store.close();
    await writeFile(options.checkpointPath, `${canonicalJournalJson(staleCheckpoint)}\n`);

    store = await PersistentMatcherStore.open(options);
    assert.equal(store.checkpoint.sequence, "2");
    assert.equal(store.checkpoint.stateRoot, finalRoot);
    await store.close();
  });
});

test("never silently recreates initialized persistence or accepts partial records", async () => {
  await withDirectory(async (directory) => {
    const options = paths(directory);
    let store = await PersistentMatcherStore.open(options);
    await store.close();
    await unlink(options.journalPath);
    await assert.rejects(() => PersistentMatcherStore.open(options), /persistence is missing/);

    await writeFile(options.journalPath, "");
    store = await PersistentMatcherStore.open(options);
    await store.mutate(orderEvent("partial", 1n));
    await store.close();
    await appendFile(options.journalPath, "{\"partial\":true}");
    await assert.rejects(() => PersistentMatcherStore.open(options), /partial record/);
  });
});
