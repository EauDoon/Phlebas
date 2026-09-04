import assert from "node:assert/strict";
import { appendFile, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { TypedOrderIntent } from "../../src/lib/eip712-order.ts";
import { createOrderDomain, hashOrderDomain, hashTypedOrder } from "../../src/lib/eip712-order.ts";
import { keccak256Text } from "../../src/lib/keccak.ts";
import { hashLegacyMatcherControlForReplay, type MatcherSignatureVerifier } from "../../src/lib/matcher-auth.ts";
import {
  EIP712_MATCHER_CONTROL_AUTHORIZATION_SCHEME,
  MATCHER_SYSTEM_REQUEST_ID_PREFIX,
  applyPersistentMatcherEvent,
  createPersistentMatcher,
  matcherControlAuthorizationCutoverRequestId,
  matcherConfigurationHash,
  matcherStateRoot,
  type PersistentMatcherConfiguration,
  type PersistentMatcherEvent,
} from "../../src/lib/persistent-matcher.ts";
import { accountIdentifier, adapterIdentifier, assetIdentifier, chainIdentifier, UINT64_MAX } from "../../src/lib/order-domain.ts";
import { VENUE_CLOB } from "../../src/lib/order-policy.ts";
import type { SolverQuote } from "../../src/lib/solver-quotes.ts";
import { hash160Value, p2pkhAddress } from "../../src/lib/zcash-address.ts";
import {
  JOURNAL_GENESIS_HASH,
  canonicalJournalJson,
  hashJournalRecord,
  type JournalCheckpoint,
  type JournalRecord,
  type JournalValue,
} from "./journal.ts";
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
  const address = p2pkhAddress(hash160Value(new TextEncoder().encode(`zcash:${name}`)), "mainnet");
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

function journalRecord(
  sequence: bigint,
  previousRecordHash: `0x${string}`,
  event: Readonly<Record<string, JournalValue>>,
): JournalRecord {
  return {
    version: 1,
    sequence: sequence.toString(),
    previousRecordHash,
    event,
    recordHash: hashJournalRecord(sequence, previousRecordHash, event),
  };
}

function legacyControlEvent(payload: Readonly<Record<string, JournalValue>>): Readonly<Record<string, JournalValue>> {
  return {
    type: "persistent-matcher-event",
    configurationHash: matcherConfigurationHash(configuration),
    payload,
  };
}

async function writeLegacyControlJournal(directory: string): Promise<readonly JournalRecord[]> {
  const firstOrder = orderEvent("legacy-order", 1n);
  const epochOrder = orderEvent("legacy-epoch-order", 3n);
  const events: Readonly<Record<string, JournalValue>>[] = [
    serializePersistentMatcherEvent(configuration, firstOrder),
    legacyControlEvent({
      version: 1,
      requestId: "legacy-cancel",
      occurredAtSeconds: (now + 2n).toString(),
      kind: "cancel-order",
      orderHash: hashTypedOrder(domain, firstOrder.submission.order),
      signature: "legacy-cancel-signature",
    }),
    serializePersistentMatcherEvent(configuration, epochOrder),
    legacyControlEvent({
      version: 1,
      requestId: "legacy-epoch",
      occurredAtSeconds: (now + 4n).toString(),
      kind: "advance-epoch",
      makerAccountId: epochOrder.submission.order.makerAccountId,
      nextEpoch: "1",
      authorizedSignerId: epochOrder.submission.order.authorizedSignerId,
      signature: "legacy-epoch-signature",
    }),
  ];
  const records: JournalRecord[] = [];
  let previous = JOURNAL_GENESIS_HASH;
  for (const [index, event] of events.entries()) {
    const record = journalRecord(BigInt(index + 1), previous, event);
    records.push(record);
    previous = record.recordHash;
  }
  await writeFile(join(directory, "events.jsonl"), `${records.map(canonicalJournalJson).join("\n")}\n`);
  await writeFile(join(directory, "checkpoint.json"), `${canonicalJournalJson({
    version: 1,
    sequence: "0",
    recordHash: JOURNAL_GENESIS_HASH,
    stateRoot: matcherStateRoot(createPersistentMatcher(configuration)),
    configurationHash: matcherConfigurationHash(configuration),
  })}\n`);
  return records;
}

function genesisCheckpoint(): JournalCheckpoint {
  return {
    version: 1,
    sequence: "0",
    recordHash: JOURNAL_GENESIS_HASH,
    stateRoot: matcherStateRoot(createPersistentMatcher(configuration)),
    configurationHash: matcherConfigurationHash(configuration),
  };
}

test("recovers every exact crash state in fresh initialization", async () => {
  await withDirectory(async (directory) => {
    const baselineDirectory = join(directory, "baseline");
    await mkdir(baselineDirectory, { recursive: true });
    const baselinePaths = paths(baselineDirectory);
    const baseline = await PersistentMatcherStore.open(baselinePaths);
    await baseline.close();
    const finalMarker = await readFile(baselinePaths.markerPath, "utf8");
    const cutoverJournal = await readFile(baselinePaths.journalPath, "utf8");
    const cutoverCheckpoint = await readFile(baselinePaths.checkpointPath, "utf8");
    const transition = `persistent-matcher-initializing-v2:${matcherConfigurationHash(configuration)}\n`;
    const genesis = `${canonicalJournalJson(genesisCheckpoint())}\n`;
    const states = [
      { name: "marker-only", journal: null, checkpoint: null },
      { name: "empty-journal", journal: "", checkpoint: null },
      { name: "genesis", journal: "", checkpoint: genesis },
      { name: "cutover-stale-checkpoint", journal: cutoverJournal, checkpoint: genesis },
      { name: "cutover-current-checkpoint", journal: cutoverJournal, checkpoint: cutoverCheckpoint },
    ] as const;

    for (const crashState of states) {
      const stateDirectory = join(directory, crashState.name);
      await mkdir(stateDirectory, { recursive: true });
      const statePaths = paths(stateDirectory);
      await writeFile(statePaths.markerPath, transition);
      if (crashState.journal !== null) await writeFile(statePaths.journalPath, crashState.journal);
      if (crashState.checkpoint !== null) await writeFile(statePaths.checkpointPath, crashState.checkpoint);
      const recovered = await PersistentMatcherStore.open(statePaths);
      assert.equal(recovered.journal.sequence, 1n);
      await recovered.close();
      assert.equal(await readFile(statePaths.markerPath, "utf8"), finalMarker);
      assert.equal(await readFile(statePaths.journalPath, "utf8"), cutoverJournal);
      assert.equal(await readFile(statePaths.checkpointPath, "utf8"), cutoverCheckpoint);
    }
  });
});

test("rejects a transitional marker over non-initialization bytes without rewriting them", async () => {
  await withDirectory(async (directory) => {
    const options = paths(directory);
    const store = await PersistentMatcherStore.open(options);
    await store.mutate(orderEvent("mature-transition", 1n));
    await store.close();
    const transition = `persistent-matcher-initializing-v2:${matcherConfigurationHash(configuration)}\n`;
    await writeFile(options.markerPath, transition);
    const beforeJournal = await readFile(options.journalPath, "utf8");
    const beforeCheckpoint = await readFile(options.checkpointPath, "utf8");
    await assert.rejects(() => PersistentMatcherStore.open(options), /unsupported records/);
    assert.equal(await readFile(options.markerPath, "utf8"), transition);
    assert.equal(await readFile(options.journalPath, "utf8"), beforeJournal);
    assert.equal(await readFile(options.checkpointPath, "utf8"), beforeCheckpoint);
  });
});

test("rejects non-exact transitional cutover bytes without promoting them", async () => {
  await withDirectory(async (directory) => {
    const baselineDirectory = join(directory, "exact-cutover");
    await mkdir(baselineDirectory, { recursive: true });
    const baselinePaths = paths(baselineDirectory);
    const baseline = await PersistentMatcherStore.open(baselinePaths);
    await baseline.close();
    const exactRecord = JSON.parse((await readFile(baselinePaths.journalPath, "utf8")).trimEnd()) as JournalRecord;
    const payload = exactRecord.event.payload as Record<string, JournalValue>;
    const alteredEvent = {
      ...exactRecord.event,
      payload: { ...payload, occurredAtSeconds: "1" },
    };
    const alteredRecord = journalRecord(1n, JOURNAL_GENESIS_HASH, alteredEvent);
    const transition = `persistent-matcher-initializing-v2:${matcherConfigurationHash(configuration)}\n`;
    const genesis = `${canonicalJournalJson(genesisCheckpoint())}\n`;
    const variants = [
      { name: "altered-time", journal: `${canonicalJournalJson(alteredRecord)}\n`, reason: /cutover journal is not canonical/ },
      { name: "noncanonical-json", journal: ` ${canonicalJournalJson(exactRecord)}\n`, reason: /cutover journal is not canonical/ },
    ] as const;

    for (const variant of variants) {
      const stateDirectory = join(directory, variant.name);
      await mkdir(stateDirectory, { recursive: true });
      const statePaths = paths(stateDirectory);
      await writeFile(statePaths.markerPath, transition);
      await writeFile(statePaths.journalPath, variant.journal);
      await writeFile(statePaths.checkpointPath, genesis);
      await assert.rejects(() => PersistentMatcherStore.open(statePaths), variant.reason);
      assert.equal(await readFile(statePaths.markerPath, "utf8"), transition);
      assert.equal(await readFile(statePaths.journalPath, "utf8"), variant.journal);
      assert.equal(await readFile(statePaths.checkpointPath, "utf8"), genesis);
    }
  });
});

test("migrates a full legacy journal with a historical system request ID", async () => {
  await withDirectory(async (directory) => {
    const options = paths(directory);
    const initialized = await PersistentMatcherStore.open(options);
    await initialized.close();
    await writeFile(options.markerPath, `persistent-matcher-v1:${matcherConfigurationHash(configuration)}\n`);
    const historical = orderEvent("system:matcher-control-authorization:eip712-v1", 1n);
    const record = journalRecord(
      1n,
      JOURNAL_GENESIS_HASH,
      serializePersistentMatcherEvent(configuration, historical),
    );
    const legacyBytes = `${canonicalJournalJson(record)}\n`;
    await writeFile(options.journalPath, legacyBytes);
    await writeFile(options.checkpointPath, `${canonicalJournalJson(genesisCheckpoint())}\n`);
    const maximumJournalBytes = Buffer.byteLength(legacyBytes, "utf8");
    const migrationOptions = { ...options, clockSeconds: () => now + 10n };

    let store = await PersistentMatcherStore.open({
      ...migrationOptions,
      maximumJournalRecords: 1,
      maximumJournalBytes,
    });
    assert.equal(store.journal.sequence, 2n);
    const historicalReplay = await store.mutate(historical);
    assert.equal(historicalReplay.replayed, true);
    assert.equal(historicalReplay.receipt.sequence, 1n);
    assert.equal(historicalReplay.receiptCheckpoint.sequence, "1");
    const cutoverReceipt = store.state.receipts[1];
    assert.equal(cutoverReceipt?.kind, "control-authorization-cutover");
    assert.ok(cutoverReceipt?.requestId.startsWith(`${MATCHER_SYSTEM_REQUEST_ID_PREFIX}matcher-control-authorization:eip712-v1:`));
    assert.notEqual(cutoverReceipt?.requestId, historical.requestId);
    await assert.rejects(
      () => store.mutate(orderEvent("capacity-after-migration", 2n)),
      /matcher-persistence-unavailable/,
    );
    const migratedBytes = await readFile(options.journalPath, "utf8");
    const root = matcherStateRoot(store.state);
    await store.close();

    store = await PersistentMatcherStore.open({
      ...migrationOptions,
      maximumJournalRecords: 1,
      maximumJournalBytes,
    });
    assert.equal(matcherStateRoot(store.state), root);
    assert.equal(await readFile(options.journalPath, "utf8"), migratedBytes);
    await store.close();
    await assert.rejects(
      () => PersistentMatcherStore.open({
        ...migrationOptions,
        maximumJournalRecords: 1,
        maximumJournalBytes: maximumJournalBytes - 1,
      }),
      /user journal byte limit exceeded/,
    );
  });
});

test("reserves new system request IDs and derives the first free cutover ID", async () => {
  await withDirectory(async (directory) => {
    const store = await PersistentMatcherStore.open(paths(directory));
    await assert.rejects(
      () => store.mutate(orderEvent("system:new-user-request", 1n)),
      /reserved system prefix/,
    );
    assert.equal(store.journal.sequence, 1n);
    await store.close();
  });

  const priorHead = keccak256Text("cutover-collision-head");
  let state = createPersistentMatcher(configuration);
  const base = matcherControlAuthorizationCutoverRequestId(state, priorHead);
  state = applyPersistentMatcherEvent(state, orderEvent(base, 1n), 1n, verifier).state;
  assert.equal(matcherControlAuthorizationCutoverRequestId(state, priorHead), `${base}:1`);
  state = applyPersistentMatcherEvent(state, orderEvent(`${base}:1`, 2n), 2n, verifier).state;
  assert.equal(matcherControlAuthorizationCutoverRequestId(state, priorHead), `${base}:2`);
});

test("upgrades a byte-stable legacy journal to an immutable authorization cutover", async () => {
  await withDirectory(async (directory) => {
    const options = paths(directory);
    const initialized = await PersistentMatcherStore.open(options);
    await initialized.close();
    await writeFile(options.markerPath, `persistent-matcher-v1:${matcherConfigurationHash(configuration)}\n`);
    await writeLegacyControlJournal(directory);
    const legacyBytes = await readFile(options.journalPath, "utf8");
    const observedDigests = new Map<string, string>();
    const replayVerifier: MatcherSignatureVerifier = {
      verify(digest, signature) {
        observedDigests.set(signature, digest);
      },
    };

    let store = await PersistentMatcherStore.open({ ...options, verifier: replayVerifier });
    assert.equal(store.state.sequence, 5n);
    const migratedBytes = await readFile(options.journalPath, "utf8");
    assert.equal(migratedBytes.slice(0, legacyBytes.length), legacyBytes);
    const legacyRoot = matcherStateRoot(store.state);
    const migratedRecords = migratedBytes.trimEnd().split("\n").map((line) => JSON.parse(line) as JournalRecord);
    const markerBytes = await readFile(options.markerPath, "utf8");
    const marker = JSON.parse(markerBytes) as {
      version: number;
      configurationHash: string;
      legacyControlCutover: { sequence: string; recordHash: string; stateRoot: string };
    };
    assert.equal(marker.version, 2);
    assert.equal(marker.configurationHash, matcherConfigurationHash(configuration));
    assert.deepEqual(marker.legacyControlCutover, {
      sequence: "5",
      recordHash: migratedRecords[4]?.recordHash,
      stateRoot: legacyRoot,
    });
    assert.equal(markerBytes, `${canonicalJournalJson(marker)}\n`);
    const cancelledOrder = orderEvent("legacy-order", 1n).submission.order;
    assert.equal(observedDigests.get("legacy-cancel-signature"), hashLegacyMatcherControlForReplay(domain, {
      kind: "cancel-order",
      orderHash: hashTypedOrder(domain, cancelledOrder),
      makerAccountId: cancelledOrder.makerAccountId,
      accountEpoch: cancelledOrder.accountEpoch,
      nonce: cancelledOrder.nonce,
      authorizedSignerId: cancelledOrder.authorizedSignerId,
    }));
    const epochOrder = orderEvent("legacy-epoch-order", 3n).submission.order;
    assert.equal(observedDigests.get("legacy-epoch-signature"), hashLegacyMatcherControlForReplay(domain, {
      kind: "advance-epoch",
      makerAccountId: epochOrder.makerAccountId,
      currentEpoch: 0n,
      nextEpoch: 1n,
      authorizedSignerId: epochOrder.authorizedSignerId,
    }));
    await store.close();

    store = await PersistentMatcherStore.open({ ...options, verifier: replayVerifier });
    assert.equal(matcherStateRoot(store.state), legacyRoot);
    assert.equal(await readFile(options.markerPath, "utf8"), markerBytes);
    await store.close();
  });
});

test("rejects unmarked controls appended beyond the journal-bound cutover", async () => {
  await withDirectory(async (directory) => {
    const options = paths(directory);
    const initialized = await PersistentMatcherStore.open(options);
    await initialized.close();
    await writeFile(options.markerPath, `persistent-matcher-v1:${matcherConfigurationHash(configuration)}\n`);
    await writeLegacyControlJournal(directory);
    const migrated = await PersistentMatcherStore.open(options);
    await migrated.close();
    await writeFile(options.markerPath, `persistent-matcher-v1:${matcherConfigurationHash(configuration)}\n`);

    const contents = await readFile(options.journalPath, "utf8");
    const records = contents.trimEnd().split("\n").map((line) => JSON.parse(line) as JournalRecord);
    const unmarked = legacyControlEvent({
      version: 1,
      requestId: "post-cutover-raw",
      occurredAtSeconds: (now + 5n).toString(),
      kind: "cancel-order",
      orderHash: keccak256Text("captured-legacy-order"),
      signature: "captured-legacy-signature",
    });
    const appended = journalRecord(6n, records[4]!.recordHash, unmarked);
    await writeFile(options.journalPath, `${contents}${canonicalJournalJson(appended)}\n`);
    await assert.rejects(
      () => PersistentMatcherStore.open(options),
      /beyond the authorization cutover/,
    );
  });
});

test("persists new controls as EIP-712 and validates the v2 marker on restart", async () => {
  await withDirectory(async (directory) => {
    const options = paths(directory);
    let store = await PersistentMatcherStore.open(options);
    const marker = JSON.parse(await readFile(options.markerPath, "utf8")) as {
      version: number;
      legacyControlCutover: { sequence: string; recordHash: string; stateRoot: string };
    };
    assert.equal(marker.version, 2);
    assert.equal(marker.legacyControlCutover.sequence, "1");

    const accepted = orderEvent("eip-order", 1n);
    await store.mutate(accepted);
    await store.mutate({
      version: 1,
      requestId: "eip-cancel",
      occurredAtSeconds: now + 2n,
      kind: "cancel-order",
      orderHash: hashTypedOrder(domain, accepted.submission.order),
      signature: "eip-cancel-signature",
      controlAuthorizationScheme: EIP712_MATCHER_CONTROL_AUTHORIZATION_SCHEME,
    });
    const root = matcherStateRoot(store.state);
    await store.close();

    const records = (await readFile(options.journalPath, "utf8")).trimEnd().split("\n")
      .map((line) => JSON.parse(line) as JournalRecord);
    assert.equal(
      (records[2]?.event.payload as Record<string, unknown>).controlAuthorizationScheme,
      EIP712_MATCHER_CONTROL_AUTHORIZATION_SCHEME,
    );
    store = await PersistentMatcherStore.open(options);
    assert.equal(matcherStateRoot(store.state), root);
    await store.close();

    const tamperedMarker = {
      ...marker,
      legacyControlCutover: { ...marker.legacyControlCutover, stateRoot: keccak256Text("wrong-cutover-root") },
    };
    await writeFile(options.markerPath, `${canonicalJournalJson(tamperedMarker)}\n`);
    await assert.rejects(() => PersistentMatcherStore.open(options), /cutover state root does not match replay/);
  });
});

test("round-trips the exact persisted event representation", () => {
  const event = orderEvent("round-trip", 1n);
  const serialized = serializePersistentMatcherEvent(configuration, event);
  assert.deepEqual(deserializePersistentMatcherEvent(configuration, serialized, { source: "ingress" }), event);
  assert.throws(
    () => deserializePersistentMatcherEvent(configuration, { ...serialized, ignored: true }, { source: "ingress" }),
    /missing or unsupported fields/,
  );

  const sourceAccount = zcashAccount("store-solver");
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
  assert.deepEqual(deserializePersistentMatcherEvent(configuration, serializedQuote, { source: "ingress" }), solverEvent);
});

test("separates marker-free EIP-712 ingress from bounded legacy journal replay", () => {
  const payload: Record<string, JournalValue> = {
    version: 1,
    requestId: "control-source",
    occurredAtSeconds: now.toString(),
    kind: "cancel-order",
    orderHash: keccak256Text("control-source-order"),
    signature: "control-source-signature",
  };
  const wrapped = legacyControlEvent(payload);
  const ingress = deserializePersistentMatcherEvent(configuration, wrapped, { source: "ingress" });
  assert.equal(ingress.kind === "cancel-order" && ingress.controlAuthorizationScheme, EIP712_MATCHER_CONTROL_AUTHORIZATION_SCHEME);
  const legacy = deserializePersistentMatcherEvent(configuration, wrapped, {
    source: "journal",
    sequence: 1n,
    legacyControlCutoverSequence: 1n,
  });
  assert.equal(legacy.kind === "cancel-order" && legacy.controlAuthorizationScheme, "legacy-raw-v1");
  assert.throws(
    () => deserializePersistentMatcherEvent(configuration, wrapped, {
      source: "journal",
      sequence: 2n,
      legacyControlCutoverSequence: 1n,
    }),
    /beyond the authorization cutover/,
  );
  for (const key of ["controlAuthorizationScheme", "authorizationScheme", "scheme"] as const) {
    assert.throws(
      () => deserializePersistentMatcherEvent(configuration, legacyControlEvent({ ...payload, [key]: "eip712-v1" }), { source: "ingress" }),
      /missing or unsupported fields/,
    );
  }
  assert.throws(
    () => deserializePersistentMatcherEvent(configuration, legacyControlEvent({
      ...payload,
      controlAuthorizationScheme: "legacy-raw-v1",
    }), {
      source: "journal",
      sequence: 1n,
      legacyControlCutoverSequence: 1n,
    }),
    /scheme is unsupported/,
  );
  assert.throws(
    () => serializePersistentMatcherEvent(configuration, {
      version: 1,
      requestId: "legacy-serialize",
      occurredAtSeconds: now,
      kind: "cancel-order",
      orderHash: keccak256Text("legacy-serialize-order"),
      signature: "legacy-serialize-signature",
      controlAuthorizationScheme: "legacy-raw-v1",
    }),
    /Only EIP-712 matcher controls may be persisted/,
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
    assert.equal(store.journal.sequence, 2n);
    const root = matcherStateRoot(store.state);
    await store.close();

    store = await PersistentMatcherStore.open(options);
    assert.equal(store.journal.sequence, 2n);
    assert.equal(matcherStateRoot(store.state), root);
    assert.equal(store.checkpoint.stateRoot, root);
    await store.close();
  });
});

test("recovers the historical receipt checkpoint after unrelated state advances and restart", async () => {
  await withDirectory(async (directory) => {
    const options = paths(directory);
    const firstEvent = orderEvent("receipt-history", 1n);
    let store = await PersistentMatcherStore.open(options);
    const first = await store.mutate(firstEvent);
    await store.mutate(orderEvent("receipt-history-unrelated", 2n));
    const replayed = await store.mutate(firstEvent);
    assert.equal(replayed.replayed, true);
    assert.deepEqual(replayed.receiptCheckpoint, first.receiptCheckpoint);
    assert.equal(replayed.receiptCheckpoint.sequence, "2");
    assert.equal(replayed.checkpoint.sequence, "3");
    await assert.rejects(
      () => store.mutate({
        ...firstEvent,
        submission: { ...firstEvent.submission, signature: "different-signature" },
      }),
      /different command/,
    );
    await store.close();

    store = await PersistentMatcherStore.open(options);
    const restartedReplay = await store.mutate(firstEvent);
    assert.equal(restartedReplay.replayed, true);
    assert.deepEqual(restartedReplay.receiptCheckpoint, first.receiptCheckpoint);
    assert.equal(restartedReplay.checkpoint.sequence, "3");
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
    assert.equal(valid.receipt.sequence, 2n);
    await store.close();

    const permissive = await PersistentMatcherStore.open({ ...options, maximumFutureEventSeconds: 60n });
    const stamped = await permissive.mutate({ ...orderEvent("future-replay", 2n), occurredAtSeconds: now + 31n });
    assert.equal(stamped.receipt.occurredAtSeconds, now);
    const lastRecord = permissive.journal.records[permissive.journal.records.length - 1];
    assert.ok(lastRecord);
    const persisted = deserializePersistentMatcherEvent(configuration, lastRecord.event, {
      source: "journal",
      sequence: BigInt(lastRecord.sequence),
      legacyControlCutoverSequence: 0n,
    });
    assert.equal(persisted.occurredAtSeconds, now);
    await permissive.close();
    const reopened = await PersistentMatcherStore.open(options);
    assert.equal(reopened.state.sequence, 3n);
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
    assert.equal(store.journal.sequence, 1n);
    await store.close();
  });
});

test("the journal records array is a live reference appended in place", async () => {
  await withDirectory(async (directory) => {
    const store = await PersistentMatcherStore.open(paths(directory));
    const records = store.journal.records;
    await store.mutate(orderEvent("live-reference-one", 1n));
    await store.mutate(orderEvent("live-reference-two", 2n));
    // The documented contract (ADR 0010, option C): the journal keeps one
    // records array for the store's lifetime and appends to it, so an
    // append is O(1). A caller holding the array sees appends; the scalar
    // fields describe the moment of the get.
    assert.strictEqual(store.journal.records, records);
    assert.equal(records.length, 3);
    assert.equal(store.journal.sequence, 3n);
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
    assert.equal(store.state.sequence, 2n);
    assert.equal(store.journal.sequence, 2n);
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
    assert.equal(store.journal.sequence, 2n);
    assert.equal(store.state.sequence, 2n);
    assert.equal(store.acceptingMutations, false);
    await assert.rejects(() => store.mutate(orderEvent("checkpoint-fault-later", 2n)), /matcher-persistence-unavailable/);
    await store.close();

    await rm(options.checkpointPath, { recursive: true });
    await writeFile(options.checkpointPath, genesisCheckpoint);
    const recovered = await PersistentMatcherStore.open(options);
    assert.equal(recovered.journal.sequence, 2n);
    assert.equal(recovered.state.sequence, 2n);
    const replayed = await recovered.mutate(acceptedEvent);
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.receipt.sequence, 2n);
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
    assert.equal(recovered.journal.sequence, 2n);
    assert.equal(recovered.acceptingMutations, true);
    await recovered.close();
  });
});

test("linearizes concurrent mutations into contiguous durable sequences", async () => {
  await withDirectory(async (directory) => {
    const store = await PersistentMatcherStore.open(paths(directory));
    const results = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      store.mutate(orderEvent(`concurrent-${index}`, BigInt(index + 1)))));
    assert.deepEqual(results.map((result) => result.receipt.sequence), Array.from({ length: 12 }, (_, index) => BigInt(index + 2)));
    assert.equal(store.journal.sequence, 13n);
    assert.equal(store.checkpoint.sequence, "13");
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
    assert.deepEqual([first.receipt.sequence, second.receipt.sequence], [3n, 4n]);
    assert.equal(first.receipt.routeKind, "solver");
    assert.equal(second.receipt.routeKind, "solver");
    assert.equal(first.receipt.remainingBaseAtoms, 0n);
    assert.equal(second.receipt.remainingBaseAtoms, 20n);
    assert.deepEqual(store.state.solverQuotes, {});
    assert.equal(store.journal.sequence, 4n);
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
    assert.equal(store.checkpoint.sequence, "3");
    assert.equal(store.checkpoint.stateRoot, finalRoot);
    await store.close();
  });
});

test("never silently recreates initialized persistence or accepts partial records", async () => {
  await withDirectory(async (directory) => {
    const options = paths(directory);
    let store = await PersistentMatcherStore.open(options);
    const initializedJournal = await readFile(options.journalPath, "utf8");
    await store.close();
    await unlink(options.journalPath);
    await assert.rejects(() => PersistentMatcherStore.open(options), /persistence is missing/);

    await writeFile(options.journalPath, initializedJournal);
    store = await PersistentMatcherStore.open(options);
    await store.mutate(orderEvent("partial", 1n));
    await store.close();
    await appendFile(options.journalPath, "{\"partial\":true}");
    await assert.rejects(() => PersistentMatcherStore.open(options), /partial record/);
  });
});
