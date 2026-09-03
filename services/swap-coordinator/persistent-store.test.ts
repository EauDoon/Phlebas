import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { swapStateRoot } from "../../src/lib/swap-root.ts";
import {
  createSwapState,
  prepareSwapFunding,
} from "../../src/lib/swap-state.ts";
import {
  fundingEvidence,
  spendEvidence,
  authorizedSwap,
  canonicalMainnetSwapTerms,
  sampleEvidencePolicies,
  sampleMarketPolicy,
  sampleSwapTerms,
  sampleTimingPolicy,
} from "../../src/lib/swap-test-fixtures.ts";
import { atomicWriteFile } from "../durable-file.ts";
import { canonicalJournalJson } from "../matcher/journal.ts";
import {
  PERSISTENCE_LOCK_FILE,
  PERSISTENCE_STORE_FILE,
  PersistentSwapStore,
  type ExpectedSwapHead,
  type PersistentSwapStoreOptions,
} from "./persistent-store.ts";

const initialState = createSwapState(sampleSwapTerms, sampleTimingPolicy, sampleEvidencePolicies, sampleMarketPolicy);

function expected(store: PersistentSwapStore): ExpectedSwapHead {
  return { journalHead: store.journal.head, stateRoot: swapStateRoot(store.state) };
}

function options(directory: string, overrides: Partial<PersistentSwapStoreOptions> = {}): PersistentSwapStoreOptions {
  return { directory, initialState, ...overrides };
}

async function tempParent(): Promise<string> {
  return mkdtemp(join(tmpdir(), "phlebas-coordinator-draft-"));
}

async function authorizeBoth(store: PersistentSwapStore): Promise<void> {
  await store.append(expected(store), {
    kind: "authorize-terms",
    partyId: sampleSwapTerms.zecSellerId,
    termsHash: initialState.termsHash,
    occurredAtSeconds: sampleSwapTerms.authorizationDeadline - 2n,
  });
  await store.append(expected(store), {
    kind: "authorize-terms",
    partyId: sampleSwapTerms.stablecoinSellerId,
    termsHash: initialState.termsHash,
    occurredAtSeconds: sampleSwapTerms.authorizationDeadline - 1n,
  });
}

test("initialize is explicit and open replays the persisted snapshot", async () => {
  const parent = await tempParent();
  const directory = join(parent, "swap");
  try {
    const store = await PersistentSwapStore.initialize(options(directory));
    assert.equal(store.journal.nextSequence, 1n);
    assert.equal(store.snapshot.nextSequence, 1n);
    await authorizeBoth(store);
    await store.close();

    const reopened = await PersistentSwapStore.open(options(directory));
    assert.equal(reopened.journal.receipts.length, 2);
    assert.deepEqual(reopened.state.authorizations, {
      "zec-seller": sampleSwapTerms.authorizationDeadline - 2n,
      "stablecoin-seller": sampleSwapTerms.authorizationDeadline - 1n,
    });
    assert.equal(reopened.snapshot.journalHead, reopened.journal.head);
    await reopened.close();
    await assert.rejects(PersistentSwapStore.initialize(options(directory)), /EEXIST|already exists/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("open never initializes a missing store", async () => {
  const parent = await tempParent();
  const directory = join(parent, "swap");
  try {
    await PersistentSwapStore.initialize(options(directory)).then((store) => store.close());
    await rm(join(directory, PERSISTENCE_STORE_FILE));
    await assert.rejects(PersistentSwapStore.open(options(directory)), /ENOENT|Persistent swap store/);
    await assert.rejects(PersistentSwapStore.open(options(join(parent, "never-created"))), /ENOENT|no such file/i);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("the codec round-trips funding facts without converting arbitrary values", async () => {
  const parent = await tempParent();
  const directory = join(parent, "swap");
  try {
    const store = await PersistentSwapStore.initialize(options(directory));
    await authorizeBoth(store);
    await store.append(expected(store), {
      kind: "prepare-funding",
      leg: "zec",
      artifactHash: initialState.swapId,
      occurredAtSeconds: sampleSwapTerms.zecFundBy - 1n,
    });
    const evidence = fundingEvidence("zec", "draft-codec");
    await store.append(expected(store), { kind: "observe-funding", evidence });
    await store.close();

    const reopened = await PersistentSwapStore.open(options(directory));
    assert.equal(reopened.state.zec.funding?.amountAtoms, sampleSwapTerms.zecAmountZatoshis);
    assert.equal(reopened.state.zec.funding?.blockHeight, 100n);
    assert.equal(reopened.state.zec.funding?.outputIndex, 0n);
    assert.equal(typeof reopened.journal.receipts[3]?.payload.kind, "string");
    await reopened.close();

    const raw = await readFile(join(directory, PERSISTENCE_STORE_FILE), "utf8");
    const withExtraField = raw.replace('"artifactHash"', '"extra":"x","artifactHash"');
    assert.notEqual(withExtraField, raw);
    await writeFile(join(directory, PERSISTENCE_STORE_FILE), withExtraField);
    await assert.rejects(PersistentSwapStore.open(options(directory)), /unknown|unsupported|canonical/i);

    const changed = raw.replace('"nextSequence":"5"', '"nextSequence":5');
    assert.notEqual(changed, raw);
    await writeFile(join(directory, PERSISTENCE_STORE_FILE), changed);
    await assert.rejects(PersistentSwapStore.open(options(directory)), /canonical|decimal|snapshot/i);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("the codec round-trips the complete spend evidence path", async () => {
  const parent = await tempParent();
  const directory = join(parent, "swap");
  try {
    const store = await PersistentSwapStore.initialize(options(directory));
    await authorizeBoth(store);

    await store.append(expected(store), {
      kind: "prepare-funding",
      leg: "zec",
      artifactHash: initialState.swapId,
      occurredAtSeconds: sampleSwapTerms.zecFundBy - 1n,
    });
    const zecEvidence = [fundingEvidence("zec", "codec-zec", sampleSwapTerms, 0), fundingEvidence("zec", "codec-zec", sampleSwapTerms, 1)];
    await store.append(expected(store), { kind: "observe-funding", evidence: zecEvidence[0]! });
    await store.append(expected(store), { kind: "observe-funding", evidence: zecEvidence[1]! });
    await store.append(expected(store), {
      kind: "confirm-funding",
      leg: "zec",
      factId: zecEvidence[0]!.fact.factId,
      qualifiedAtSeconds: zecEvidence[0]!.attestation.observedAtSeconds,
    });

    await store.append(expected(store), {
      kind: "prepare-funding",
      leg: "evm",
      artifactHash: initialState.swapId,
      occurredAtSeconds: sampleSwapTerms.evmFundBy - 1n,
    });
    const evmEvidence = [fundingEvidence("evm", "1", sampleSwapTerms, 0), fundingEvidence("evm", "1", sampleSwapTerms, 1)];
    await store.append(expected(store), { kind: "observe-funding", evidence: evmEvidence[0]! });
    await store.append(expected(store), { kind: "observe-funding", evidence: evmEvidence[1]! });
    await store.append(expected(store), {
      kind: "confirm-funding",
      leg: "evm",
      factId: evmEvidence[0]!.fact.factId,
      qualifiedAtSeconds: evmEvidence[0]!.attestation.observedAtSeconds,
    });

    const spendTime = sampleSwapTerms.evmRefundTime;
    const spend = [spendEvidence("evm", "refund", spendTime, sampleSwapTerms, 0), spendEvidence("evm", "refund", spendTime, sampleSwapTerms, 1)];
    await store.append(expected(store), { kind: "observe-spend", evidence: spend[0]! });
    await store.append(expected(store), { kind: "observe-spend", evidence: spend[1]! });
    await store.append(expected(store), {
      kind: "confirm-spend",
      leg: "evm",
      factId: spend[0]!.fact.factId,
      qualifiedAtSeconds: spend[0]!.attestation.observedAtSeconds,
    });
    await store.close();

    const reopened = await PersistentSwapStore.open(options(directory));
    assert.equal(reopened.journal.receipts.length, 13);
    assert.equal(reopened.state.evm.spend?.amountAtoms, sampleSwapTerms.quoteAmountAtoms);
    assert.equal(reopened.state.evm.spend?.inputOrLogIndex, 0n);
    assert.equal(reopened.state.evm.spend?.preimage, undefined);
    assert.equal(reopened.state.evm.phase, "refunded-confirmed");
    assert.equal(reopened.state.confirmedSecretFactId, undefined);
    await reopened.close();
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("serial mutations reject stale head and root, including duplicate retries", async () => {
  const parent = await tempParent();
  const directory = join(parent, "swap");
  try {
    const store = await PersistentSwapStore.initialize(options(directory));
    const firstPayload = {
      kind: "authorize-terms" as const,
      partyId: sampleSwapTerms.zecSellerId,
      termsHash: initialState.termsHash,
      occurredAtSeconds: sampleSwapTerms.authorizationDeadline - 2n,
    };
    const stale = expected(store);
    const outcomes = await Promise.allSettled([
      store.append(stale, firstPayload),
      store.append(stale, {
        ...firstPayload,
        partyId: sampleSwapTerms.stablecoinSellerId,
      }),
    ]);
    assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(outcomes.filter((item) => item.status === "rejected").length, 1);
    const rejected = outcomes.find((item): item is PromiseRejectedResult => item.status === "rejected");
    assert.match(String(rejected?.reason), /head/);

    const retry = await store.append(expected(store), firstPayload);
    assert.equal(retry.appended, false);
    assert.equal(retry.receipt.sequence, 1n);
    await assert.rejects(
      store.append({ ...expected(store), stateRoot: initialState.termsHash }, { ...firstPayload, partyId: sampleSwapTerms.stablecoinSellerId }),
      /state root/,
    );
    await store.close();
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("returned state and journal values are immutable copies", async () => {
  const parent = await tempParent();
  const directory = join(parent, "swap");
  try {
    const store = await PersistentSwapStore.initialize(options(directory));
    await authorizeBoth(store);
    const state = store.state as { authorizations: Record<string, bigint> };
    assert.equal(Object.isFrozen(state), true);
    assert.equal(Object.isFrozen(state.authorizations), true);
    assert.throws(() => { state.authorizations["zec-seller"] = 1n; }, TypeError);
    const journal = store.journal;
    assert.equal(Object.isFrozen(journal.receipts), true);
    assert.throws(() => { (journal.receipts[0]!.payload as unknown as { kind: string }).kind = "changed"; }, TypeError);
    await store.close();
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("one writer owns the lock and refuses changed ownership", async () => {
  const parent = await tempParent();
  const directory = join(parent, "swap");
  try {
    const store = await PersistentSwapStore.initialize(options(directory));
    await assert.rejects(PersistentSwapStore.open(options(directory)), /writer lock/);
    await writeFile(join(directory, PERSISTENCE_LOCK_FILE), "tampered\n");
    await assert.rejects(
      store.append(expected(store), {
        kind: "flag-dispute",
        reason: "observer-stale",
        detail: "lock changed",
      }),
      /poisoned|ownership/,
    );
    await assert.rejects(store.close(), /ownership/);
    assert.equal(await readFile(join(directory, PERSISTENCE_LOCK_FILE), "utf8"), "tampered\n");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("an uncertain atomic write poisons the store while restart replays whichever commit won", async () => {
  const parent = await tempParent();
  const directory = join(parent, "swap");
  let writes = 0;
  try {
    const store = await PersistentSwapStore.initialize(options(directory, {
      atomicWrite: async (path, contents) => {
        writes += 1;
        await atomicWriteFile(path, contents);
        if (writes === 2) throw new Error("injected post-rename failure");
      },
    }));
    const payload = {
      kind: "authorize-terms" as const,
      partyId: sampleSwapTerms.zecSellerId,
      termsHash: initialState.termsHash,
      occurredAtSeconds: sampleSwapTerms.authorizationDeadline - 2n,
    };
    await assert.rejects(store.append(expected(store), payload), /uncertain write/);
    assert.equal(store.poisoned, true);
    await assert.rejects(store.append(expected(store), payload), /uncertain write/);
    await store.close();

    const reopened = await PersistentSwapStore.open(options(directory));
    assert.equal(reopened.journal.receipts.length, 1);
    await reopened.close();
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("concurrent close callers wait for the delayed write and durable lock release", async () => {
  const parent = await tempParent();
  const directory = join(parent, "swap");
  let writes = 0;
  let writeStarted!: () => void;
  const started = new Promise<void>((resolve) => { writeStarted = resolve; });
  let appendPromise: Promise<unknown> | undefined;
  let firstClose: Promise<void> | undefined;
  try {
    const store = await PersistentSwapStore.initialize(options(directory, {
      atomicWrite: async (path, contents) => {
        writes += 1;
        if (writes === 2) {
          writeStarted();
          await new Promise<void>((resolve) => setTimeout(resolve, 50));
        }
        await atomicWriteFile(path, contents);
      },
    }));
    appendPromise = store.append(expected(store), {
      kind: "authorize-terms",
      partyId: sampleSwapTerms.zecSellerId,
      termsHash: initialState.termsHash,
      occurredAtSeconds: sampleSwapTerms.authorizationDeadline - 2n,
    });
    await started;
    firstClose = store.close();
    const secondClose = store.close();
    await secondClose;
    const reopened = await PersistentSwapStore.open(options(directory));
    assert.equal(reopened.journal.receipts.length, 1);
    await reopened.close();
    await firstClose;
  } finally {
    await appendPromise?.catch(() => undefined);
    await firstClose?.catch(() => undefined);
    await rm(parent, { recursive: true, force: true });
  }
});

test("event and byte limits reject before commit", async () => {
  const parent = await tempParent();
  const directory = join(parent, "swap");
  try {
    const store = await PersistentSwapStore.initialize(options(directory, { maximumEvents: 1 }));
    const payload = {
      kind: "authorize-terms" as const,
      partyId: sampleSwapTerms.zecSellerId,
      termsHash: initialState.termsHash,
      occurredAtSeconds: sampleSwapTerms.authorizationDeadline - 2n,
    };
    await store.append(expected(store), payload);
    await assert.rejects(store.append(expected(store), {
      ...payload,
      partyId: sampleSwapTerms.stablecoinSellerId,
    }), /event limit/);
    assert.equal(store.journal.receipts.length, 1);
    await store.close();

    const genesisDirectory = join(parent, "genesis");
    const genesis = await PersistentSwapStore.initialize(options(genesisDirectory));
    await genesis.close();
    const genesisBytes = await readFile(join(genesisDirectory, PERSISTENCE_STORE_FILE));
    let writes = 0;
    const byteDirectory = join(parent, "byte-limited");
    const byteLimited = await PersistentSwapStore.initialize(options(byteDirectory, {
      maximumBytes: genesisBytes.byteLength + 1,
      atomicWrite: async (path, contents) => {
        writes += 1;
        await atomicWriteFile(path, contents);
      },
    }));
    assert.equal(writes, 1);
    await assert.rejects(byteLimited.append(expected(byteLimited), payload), /byte limit/);
    assert.equal(writes, 1, "byte overflow invoked the atomic writer");
    assert.deepEqual(
      await readFile(join(byteDirectory, PERSISTENCE_STORE_FILE)),
      genesisBytes,
    );
    await byteLimited.close();
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("bounded store reads reject an oversized persisted file", async () => {
  const parent = await tempParent();
  const directory = join(parent, "swap");
  try {
    const store = await PersistentSwapStore.initialize(options(directory));
    await store.close();
    const bytes = await readFile(join(directory, PERSISTENCE_STORE_FILE));
    assert.ok(bytes.byteLength > 1);
    await assert.rejects(
      PersistentSwapStore.open(options(directory, { maximumBytes: bytes.byteLength - 1 })),
      /byte limit/,
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("trusted initial state must be pristine", async () => {
  const parent = await tempParent();
  try {
    const state = prepareSwapFunding(
      authorizedSwap(),
      "zec",
      initialState.swapId,
      sampleSwapTerms.zecFundBy - 1n,
    );
    await assert.rejects(
      PersistentSwapStore.initialize(options(join(parent, "swap"), { initialState: state })),
      /pristine|journal|authorization|canonical/,
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("corrupt or mismatched history is rejected without rewriting failed store bytes", async () => {
  const parent = await tempParent();
  const directory = join(parent, "swap");
  try {
    const store = await PersistentSwapStore.initialize(options(directory));
    await authorizeBoth(store);
    await store.close();

    const storePath = join(directory, PERSISTENCE_STORE_FILE);
    const original = await readFile(storePath, "utf8");
    const wrongInitialState = createSwapState(
      canonicalMainnetSwapTerms(),
      sampleTimingPolicy,
      sampleEvidencePolicies,
      sampleMarketPolicy,
    );
    type RawDocument = {
      swapId: string;
      termsHash: string;
      events: unknown[];
      snapshot: Record<string, unknown>;
    };
    const canonicalMutation = (mutate: (document: RawDocument) => void): string => {
      const document = JSON.parse(original) as RawDocument;
      mutate(document);
      return `${canonicalJournalJson(document)}\n`;
    };
    const alternateHex = `0x${"11".repeat(32)}`;
    const cases: ReadonlyArray<{
      name: string;
      contents?: string;
      initialState?: typeof initialState;
      expected: RegExp;
    }> = [
      {
        name: "trusted initial state with a different terms identity",
        initialState: wrongInitialState,
        expected: /identity|initial state/i,
      },
      {
        name: "persisted swap identity mismatch",
        contents: canonicalMutation((document) => { document.swapId = alternateHex; }),
        expected: /identity/i,
      },
      {
        name: "persisted terms identity mismatch",
        contents: canonicalMutation((document) => { document.termsHash = alternateHex; }),
        expected: /identity/i,
      },
      {
        name: "snapshot state root tamper",
        contents: canonicalMutation((document) => { document.snapshot.stateRoot = alternateHex; }),
        expected: /snapshot|root/i,
      },
      {
        name: "snapshot journal head tamper",
        contents: canonicalMutation((document) => { document.snapshot.journalHead = alternateHex; }),
        expected: /snapshot|journal|head/i,
      },
      {
        name: "oversized canonical decimal",
        contents: canonicalMutation((document) => { document.snapshot.nextSequence = `1${"0".repeat(20)}`; }),
        expected: /fit uint64|decimal/i,
      },
      {
        name: "truncated JSON",
        contents: original.slice(0, -2),
        expected: /valid bounded JSON|JSON/i,
      },
      {
        name: "valid JSON without canonical newline",
        contents: original.trimEnd(),
        expected: /canonical/i,
      },
      {
        name: "duplicate event history",
        contents: canonicalMutation((document) => {
          document.events = [document.events[0], document.events[0]];
        }),
        expected: /duplicate/i,
      },
      {
        name: "reordered event history",
        contents: canonicalMutation((document) => {
          document.events = [...document.events].reverse();
        }),
        expected: /snapshot|bind|journal|root/i,
      },
    ];

    for (const corruption of cases) {
      const contents = corruption.contents ?? original;
      await writeFile(storePath, contents);
      await assert.rejects(
        PersistentSwapStore.open(options(directory, { initialState: corruption.initialState ?? initialState })),
        corruption.expected,
        corruption.name,
      );
      assert.equal(await readFile(storePath, "utf8"), contents, `${corruption.name} rewrote the store`);
      await writeFile(storePath, original);
    }
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
