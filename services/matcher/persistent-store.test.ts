import assert from "node:assert/strict";
import { appendFile, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { TypedOrderIntent } from "../../src/lib/eip712-order.ts";
import { createOrderDomain, hashOrderDomain } from "../../src/lib/eip712-order.ts";
import { keccak256Text } from "../../src/lib/keccak.ts";
import type { MatcherSignatureVerifier } from "../../src/lib/matcher-auth.ts";
import { matcherStateRoot, type PersistentMatcherConfiguration, type PersistentMatcherEvent } from "../../src/lib/persistent-matcher.ts";
import { accountIdentifier, adapterIdentifier, assetIdentifier, chainIdentifier, UINT64_MAX } from "../../src/lib/order-domain.ts";
import { VENUE_CLOB } from "../../src/lib/order-policy.ts";
import type { SolverQuote } from "../../src/lib/solver-quotes.ts";
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
    maximumFeeBps: 0n,
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

function orderEvent(requestId: string, nonce: bigint): Extract<PersistentMatcherEvent, { kind: "accept-order" }> {
  const sourceAccount = zcashAccount(`maker:${nonce}`);
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

function paths(directory: string, matcherConfiguration = configuration) {
  return {
    journalPath: join(directory, "events.jsonl"),
    checkpointPath: join(directory, "checkpoint.json"),
    markerPath: join(directory, "initialized"),
    lockPath: join(directory, "writer.lock"),
    configuration: matcherConfiguration,
    verifier,
    clockSeconds: () => now,
  };
}

function solverQuoteEvent(
  requestId: string,
  name: string,
  amount: bigint,
  nonce: bigint,
): Extract<PersistentMatcherEvent, { kind: "accept-solver-quote" }> {
  const sourceAccount = zcashAccount(`solver:${name}`);
  const recipientAccount = `${quoteNetwork}:0x${"33".repeat(20)}`;
  const quote: SolverQuote = {
    version: 1,
    matcherDomainHash: hashOrderDomain(domain),
    solverAccountId: accountIdentifier(sourceAccount),
    authorizedSignerId: accountIdentifier(`${quoteNetwork}:solver-signer`),
    recipientAccountId: accountIdentifier(recipientAccount),
    sourceAccount,
    recipientAccount,
    baseNetwork,
    baseAsset,
    quoteNetwork,
    quoteAsset,
    side: 1,
    capacityBaseAtoms: amount,
    minimumFillBaseAtoms: 1n,
    pricePolicy: { kind: "fixed", priceTicks: 5_000n },
    maximumSlippageBps: 0n,
    feeBps: 0n,
    accountEpoch: 0n,
    nonce,
    expirySeconds: now + 4_000n,
    settlementProtocolVersion: protocol,
  };
  return {
    version: 1,
    requestId,
    occurredAtSeconds: now,
    kind: "accept-solver-quote",
    quote,
    signature: `solver-signature:${requestId}`,
  };
}

function solverTakerEvent(requestId: string, amount: bigint, nonce: bigint): Extract<PersistentMatcherEvent, { kind: "accept-order" }> {
  const sourceAccount = `${quoteNetwork}:0x${(nonce + 4000n).toString(16).padStart(40, "0")}`;
  const recipientAccount = zcashAccount(`taker:${nonce}`);
  const order: TypedOrderIntent = {
    makerAccountId: accountIdentifier(sourceAccount),
    authorizedSignerId: accountIdentifier(`${quoteNetwork}:taker-signer`),
    recipientAccountId: accountIdentifier(recipientAccount),
    baseChainId: chainIdentifier(baseNetwork),
    baseAssetId: assetIdentifier(baseAsset),
    quoteChainId: chainIdentifier(quoteNetwork),
    quoteAssetId: assetIdentifier(quoteAsset),
    side: 0,
    baseAmountAtoms: amount,
    limitPriceTicks: 5_100n,
    nonce,
    accountEpoch: 0n,
    expiry: now + 5_000n,
    salt: keccak256Text(`store-solver-taker:${nonce}`),
    timeInForce: 1,
    maximumFeeBps: 30n,
    allowedVenues: 2,
    settlementAdapterId: adapterIdentifier(protocol),
  };
  return {
    version: 1,
    requestId,
    occurredAtSeconds: now + 1n,
    kind: "accept-order",
    submission: {
      order,
      signature: `signature:${requestId}`,
      accounts: { sourceAccount, recipientAccount },
    },
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

  const sourceAccount = "zcash:mainnet:t3-store-solver";
  const recipientAccount = `${quoteNetwork}:0x${"22".repeat(20)}`;
  const quote: SolverQuote = {
    version: 1,
    matcherDomainHash: hashOrderDomain(domain),
    solverAccountId: accountIdentifier(sourceAccount),
    authorizedSignerId: accountIdentifier(`${quoteNetwork}:solver-signer`),
    recipientAccountId: accountIdentifier(recipientAccount),
    sourceAccount,
    recipientAccount,
    baseNetwork,
    baseAsset,
    quoteNetwork,
    quoteAsset,
    side: 1,
    capacityBaseAtoms: 100n,
    minimumFillBaseAtoms: 1n,
    pricePolicy: { kind: "fixed", priceTicks: 5_000n },
    maximumSlippageBps: 0n,
    feeBps: 0n,
    accountEpoch: 3n,
    nonce: 9n,
    expirySeconds: now + 1_000n,
    settlementProtocolVersion: protocol,
  };
  const solverEvent: Extract<PersistentMatcherEvent, { kind: "accept-solver-quote" }> = {
    version: 1,
    requestId: "round-trip-quote",
    occurredAtSeconds: now,
    kind: "accept-solver-quote",
    quote,
    signature: "solver-signature",
  };
  const serializedQuote = serializePersistentMatcherEvent(configuration, solverEvent);
  assert.deepEqual(deserializePersistentMatcherEvent(configuration, serializedQuote), solverEvent);
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

test("rejects client timestamps beyond the trusted skew and persists trusted intake time", async () => {
  await withDirectory(async (directory) => {
    const options = paths(directory);
    const store = await PersistentMatcherStore.open(options);
    await assert.rejects(
      () => store.mutate({ ...orderEvent("future-intake", 1n), occurredAtSeconds: now + 31n }),
      /too far in the future/,
    );
    await assert.rejects(
      () => store.mutate({ ...orderEvent("future-maximum", 2n), occurredAtSeconds: UINT64_MAX }),
      /too far in the future/,
    );
    const valid = await store.mutate(orderEvent("after-future-rejection", 3n));
    assert.equal(valid.receipt.sequence, 1n);
    await store.close();

    const permissive = await PersistentMatcherStore.open({ ...options, maximumFutureEventSeconds: 60n });
    const stamped = await permissive.mutate({ ...orderEvent("future-replay", 2n), occurredAtSeconds: now + 31n });
    assert.equal(stamped.receipt.occurredAtSeconds, now);
    const lastRecord = permissive.journal.records[permissive.journal.records.length - 1];
    assert.ok(lastRecord);
    const persisted = deserializePersistentMatcherEvent(configuration, lastRecord.event);
    assert.equal(persisted.occurredAtSeconds, now);
    await permissive.close();
    const reopened = await PersistentMatcherStore.open(options);
    assert.equal(reopened.state.sequence, 2n);
    assert.equal(reopened.state.lastEventAtSeconds, now);
    await reopened.close();
  });
});

test("does not let an initially backdated event revive an expired order", async () => {
  await withDirectory(async (directory) => {
    const options = paths(directory);
    const store = await PersistentMatcherStore.open(options);
    const candidate = orderEvent("initial-backdate", 1n);
    const backdatedExpired = {
      ...candidate,
      occurredAtSeconds: 0n,
      submission: {
        ...candidate.submission,
        order: { ...candidate.submission.order, expiry: 5_000n },
      },
    } satisfies Extract<PersistentMatcherEvent, { kind: "accept-order" }>;
    await assert.rejects(
      () => store.mutate(backdatedExpired),
      /Order must have a future uint64 bigint expiry/,
    );
    assert.equal(store.journal.sequence, 0n);
    await store.close();
  });
});

test("fails closed when trusted time moves backward after an accepted event", async () => {
  await withDirectory(async (directory) => {
    let trustedNow = now;
    const store = await PersistentMatcherStore.open({ ...paths(directory), clockSeconds: () => trustedNow });
    await store.mutate(orderEvent("trusted-clock-one", 1n));
    trustedNow = now - 1n;
    await assert.rejects(
      () => store.mutate(orderEvent("trusted-clock-two", 2n)),
      /moved backward/,
    );
    assert.equal(store.state.sequence, 1n);
    assert.equal(store.journal.sequence, 1n);
    await store.close();
  });
});

test("degrades after a checkpoint write fault and replays the appended event on restart", async () => {
  await withDirectory(async (directory) => {
    const options = paths(directory);
    const store = await PersistentMatcherStore.open(options);
    const genesisCheckpoint = await readFile(options.checkpointPath, "utf8");
    await unlink(options.checkpointPath);
    await mkdir(options.checkpointPath);
    const acceptedEvent = orderEvent("checkpoint-fault", 1n);
    await assert.rejects(() => store.mutate(acceptedEvent), /matcher-persistence-unavailable:checkpoint/);
    assert.equal(store.journal.sequence, 1n);
    assert.equal(store.state.sequence, 1n);
    assert.equal(store.acceptingMutations, false);
    await assert.rejects(() => store.mutate(orderEvent("checkpoint-fault-later", 2n)), /matcher-persistence-unavailable/);
    await store.close();

    await rm(options.checkpointPath, { recursive: true });
    await writeFile(options.checkpointPath, genesisCheckpoint);
    const recovered = await PersistentMatcherStore.open(options);
    assert.equal(recovered.journal.sequence, 1n);
    assert.equal(recovered.state.sequence, 1n);
    const replayed = await recovered.mutate(acceptedEvent);
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.receipt.sequence, 1n);
    await recovered.close();
  });
});

test("latches journal durability failures and recovers after restart with a larger limit", async () => {
  await withDirectory(async (directory) => {
    const constrained = { ...paths(directory), maximumJournalRecords: 1 };
    const store = await PersistentMatcherStore.open(constrained);
    await store.mutate(orderEvent("durable-one", 1n));
    await assert.rejects(() => store.mutate(orderEvent("durable-two", 2n)), /matcher-persistence-unavailable/);
    assert.equal(store.acceptingMutations, false);
    assert.match(store.faultReason ?? "", /journal-append/);
    await assert.rejects(() => store.mutate(orderEvent("durable-three", 3n)), /matcher-persistence-unavailable/);
    await store.close();

    const recovered = await PersistentMatcherStore.open({ ...constrained, maximumJournalRecords: 10 });
    assert.equal(recovered.journal.sequence, 1n);
    assert.equal(recovered.acceptingMutations, true);
    await recovered.close();
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

test("serializes concurrent takers against one solver quote without exceeding capacity", async () => {
  await withDirectory(async (directory) => {
    const store = await PersistentMatcherStore.open(paths(directory));
    await store.mutate(solverQuoteEvent("solver-capacity", "serialized", 100n, 1n));
    const [first, second] = await Promise.all([
      store.mutate(solverTakerEvent("solver-taker-one", 60n, 2n)),
      store.mutate(solverTakerEvent("solver-taker-two", 60n, 3n)),
    ]);
    assert.deepEqual([first.receipt.sequence, second.receipt.sequence], [2n, 3n]);
    assert.equal(first.receipt.routeKind, "solver");
    assert.equal(second.receipt.routeKind, "solver");
    assert.equal(first.receipt.remainingBaseAtoms, 0n);
    assert.equal(second.receipt.remainingBaseAtoms, 20n);
    assert.deepEqual(store.state.solverQuotes, {});
    assert.equal(store.journal.sequence, 3n);
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

test("never removes a writer lock whose ownership token changed", async () => {
  await withDirectory(async (directory) => {
    const options = paths(directory);
    const store = await PersistentMatcherStore.open(options);
    const replacement = '{"configurationHash":"foreign","ownerToken":"foreign","pid":999,"version":1}\n';
    await writeFile(options.lockPath, replacement);
    await assert.rejects(() => store.close(), /ownership changed/);
    assert.equal(await readFile(options.lockPath, "utf8"), replacement);
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
