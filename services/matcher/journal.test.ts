import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { keccak256Text } from "../../src/lib/keccak.ts";
import {
  JOURNAL_GENESIS_HASH,
  appendJournal,
  assertCheckpointInJournal,
  canonicalJournalJson,
  readJournal,
  readJournalCheckpoint,
  writeJournalCheckpoint,
} from "./journal.ts";

test("appends and restores a monotonic hash-chained journal", async () => {
  const directory = await mkdtemp(join(tmpdir(), "phlebas-journal-"));
  const path = join(directory, "events.jsonl");
  try {
    const empty = await readJournal(path);
    const first = await appendJournal(path, empty, { kind: "order.accepted", nonce: "1" });
    const afterFirst = await readJournal(path);
    const second = await appendJournal(path, afterFirst, { kind: "order.cancelled", orderHash: keccak256Text("order") });
    const restored = await readJournal(path);
    assert.equal(first.sequence, "1");
    assert.equal(second.sequence, "2");
    assert.equal(second.previousRecordHash, first.recordHash);
    assert.equal(restored.sequence, 2n);
    assert.equal(restored.head, second.recordHash);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("serializes concurrent appends and rejects the stale expected head", async () => {
  const directory = await mkdtemp(join(tmpdir(), "phlebas-journal-race-"));
  const path = join(directory, "events.jsonl");
  try {
    const empty = await readJournal(path);
    const outcomes = await Promise.allSettled([
      appendJournal(path, empty, { kind: "one" }),
      appendJournal(path, empty, { kind: "two" }),
    ]);
    assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = outcomes.find((result) => result.status === "rejected");
    assert.ok(rejected && rejected.status === "rejected");
    assert.match(String(rejected.reason), /head changed/);
    assert.equal((await readJournal(path)).sequence, 1n);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("preflights the journal byte limit and detects external size changes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "phlebas-journal-size-"));
  const path = join(directory, "events.jsonl");
  try {
    const empty = await readJournal(path, { maxBytes: 1_024 });
    const first = await appendJournal(path, empty, { kind: "one" }, { maxBytes: 1_024 });
    const afterFirst = await readJournal(path, { maxBytes: 1_024 });
    assert.equal(afterFirst.byteLength, Buffer.byteLength(await readFile(path, "utf8"), "utf8"));
    await writeFile(path, `${await readFile(path, "utf8")}\n`);
    await assert.rejects(
      () => appendJournal(path, afterFirst, { kind: "two" }, { maxBytes: 1_024 }),
      /size changed/,
    );

    await assert.rejects(
      () => readJournal(path, { maxBytes: first.recordHash.length }),
      /byte limit/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("detects omission, sequence gaps, record changes, and partial trailing writes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "phlebas-journal-corrupt-"));
  const path = join(directory, "events.jsonl");
  try {
    const first = await appendJournal(path, await readJournal(path), { kind: "one" });
    await appendJournal(path, await readJournal(path), { kind: "two" });
    const lines = (await readFile(path, "utf8")).trimEnd().split("\n");

    await writeFile(path, `${lines[1]}\n`);
    await assert.rejects(() => readJournal(path), /gap or reordering/);

    const changed = JSON.parse(lines[0] ?? "{}") as { event: { kind: string } };
    changed.event.kind = "changed";
    await writeFile(path, `${JSON.stringify(changed)}\n`);
    await assert.rejects(() => readJournal(path), /hash does not match/);

    await writeFile(path, canonicalJournalJson(first));
    await assert.rejects(() => readJournal(path), /partial record/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("binds atomic checkpoints to an exact journal prefix", async () => {
  const directory = await mkdtemp(join(tmpdir(), "phlebas-journal-checkpoint-"));
  const journalPath = join(directory, "events.jsonl");
  const checkpointPath = join(directory, "checkpoint.json");
  try {
    const first = await appendJournal(journalPath, await readJournal(journalPath), { kind: "one" });
    await writeJournalCheckpoint(checkpointPath, {
      version: 1,
      sequence: "1",
      recordHash: first.recordHash,
      stateRoot: keccak256Text("state-at-one"),
      configurationHash: keccak256Text("configuration"),
    });
    const checkpoint = await readJournalCheckpoint(checkpointPath);
    assert.ok(checkpoint);
    const oneRecord = await readJournal(journalPath);
    assert.doesNotThrow(() => assertCheckpointInJournal(checkpoint, oneRecord));

    const second = await appendJournal(journalPath, await readJournal(journalPath), { kind: "two" });
    const full = await readJournal(journalPath);
    assert.doesNotThrow(() => assertCheckpointInJournal(checkpoint, full));
    assert.throws(() => assertCheckpointInJournal({ ...checkpoint, sequence: "2", recordHash: first.recordHash }, full), /does not bind/);
    assert.throws(() => assertCheckpointInJournal({ ...checkpoint, sequence: "3", recordHash: second.recordHash }, full), /ahead/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("canonical JSON rejects ambiguous and prototype-sensitive values", () => {
  assert.equal(canonicalJournalJson({ z: 1, a: [true, null, "x"] }), '{"a":[true,null,"x"],"z":1}');
  assert.throws(() => canonicalJournalJson({ amount: 1n }), /JSON-compatible/);
  assert.throws(() => canonicalJournalJson({ amount: Number.MAX_SAFE_INTEGER + 1 }), /safe integers/);
  const forbidden = Object.create(null) as Record<string, unknown>;
  forbidden.__proto__ = "bad";
  assert.throws(() => canonicalJournalJson(forbidden), /forbidden/);
});

test("rejects journal and checkpoint extension fields", async () => {
  const directory = await mkdtemp(join(tmpdir(), "phlebas-journal-shape-"));
  const journalPath = join(directory, "events.jsonl");
  const checkpointPath = join(directory, "checkpoint.json");
  try {
    const record = await appendJournal(journalPath, await readJournal(journalPath), { kind: "one" });
    const parsed = JSON.parse(await readFile(journalPath, "utf8")) as Record<string, unknown>;
    await writeFile(journalPath, `${JSON.stringify({ ...parsed, ignored: true })}\n`);
    await assert.rejects(() => readJournal(journalPath), /missing or unsupported fields/);

    await writeFile(checkpointPath, `${JSON.stringify({
      version: 1,
      sequence: "1",
      recordHash: record.recordHash,
      stateRoot: keccak256Text("state"),
      configurationHash: keccak256Text("configuration"),
      ignored: true,
    })}\n`);
    await assert.rejects(() => readJournalCheckpoint(checkpointPath), /missing or unsupported fields/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("genesis checkpoints require the genesis hash", async () => {
  const directory = await mkdtemp(join(tmpdir(), "phlebas-journal-genesis-"));
  const path = join(directory, "checkpoint.json");
  try {
    await writeJournalCheckpoint(path, {
      version: 1,
      sequence: "0",
      recordHash: JOURNAL_GENESIS_HASH,
      stateRoot: keccak256Text("empty-state"),
      configurationHash: keccak256Text("configuration"),
    });
    assert.equal((await readJournalCheckpoint(path))?.sequence, "0");
    await assert.rejects(() => writeJournalCheckpoint(path, {
      version: 1,
      sequence: "0",
      recordHash: keccak256Text("not-genesis"),
      stateRoot: keccak256Text("empty-state"),
      configurationHash: keccak256Text("configuration"),
    }), /non-genesis/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
