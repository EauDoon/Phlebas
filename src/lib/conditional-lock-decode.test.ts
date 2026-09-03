import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  CLAIM_SELECTOR,
  LOCK_CREATED_EVENT_SIGNATURE,
  decodeClaimCalldata,
  decodeConditionalLockConstructorArgs,
  decodeConditionalLockCreatedLog,
  encodeClaimCalldata,
  encodeConditionalLockConstructorArgs,
  type ConditionalLockTerms,
} from "./conditional-lock-abi.ts";

// These are synthetic ABI vectors. They are not deployment receipts or chain evidence.
const TERMS: ConditionalLockTerms = {
  swapId: `0x${"11".repeat(32)}`,
  termsHash: `0x${"22".repeat(32)}`,
  token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  funder: "0x1111111111111111111111111111111111111111",
  claimRecipient: "0x2222222222222222222222222222222222222222",
  refundRecipient: "0x1111111111111111111111111111111111111111",
  amount: 100_000_000n,
  hashlock: `0x${"33".repeat(32)}`,
  fundingCutoff: 1_900_000_000n,
  claimCutoff: 1_900_003_600n,
  refundTime: 1_900_007_200n,
};

const NORMALIZED_TERMS: ConditionalLockTerms = { ...TERMS };

function upperHex(value: string): string {
  return `0x${value.slice(2).toUpperCase()}`;
}

function words(encoded: string, expectedCount: number): string[] {
  assert.match(encoded, /^0x[0-9a-f]{64,}$/i);
  const body = encoded.slice(2);
  assert.equal(body.length, expectedCount * 64);
  return Array.from({ length: expectedCount }, (_, index) => (
    `0x${body.slice(index * 64, (index + 1) * 64)}`
  ));
}

function joinedWords(values: readonly string[]): string {
  return `0x${values.map((value) => value.slice(2)).join("")}`;
}

function addressWord(address: string): string {
  return `0x${"0".repeat(24)}${address.slice(2)}`;
}

function uintWord(value: bigint): string {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

const constructorEncoded = encodeConditionalLockConstructorArgs(TERMS);
const constructorWords = words(constructorEncoded, 11);
const EXPECTED_CONSTRUCTOR_WORDS = [
  `0x${"11".repeat(32)}`,
  `0x${"22".repeat(32)}`,
  addressWord(TERMS.token),
  addressWord(TERMS.funder),
  addressWord(TERMS.claimRecipient),
  addressWord(TERMS.refundRecipient),
  "0x0000000000000000000000000000000000000000000000000000000005f5e100",
  `0x${"33".repeat(32)}`,
  "0x00000000000000000000000000000000000000000000000000000000713fb300",
  "0x00000000000000000000000000000000000000000000000000000000713fc110",
  "0x00000000000000000000000000000000000000000000000000000000713fcf20",
] as const;
const eventTopics = Object.freeze([
  `0x${LOCK_CREATED_EVENT_SIGNATURE}`,
  constructorWords[0]!,
  constructorWords[1]!,
  constructorWords[2]!,
] as const);
const eventData = joinedWords(constructorWords.slice(3));

function eventWithData(data: string, topics: readonly string[] = eventTopics): ConditionalLockTerms {
  return decodeConditionalLockCreatedLog(topics, data);
}

test("constructor decoder follows ConditionalLock's exact eleven-word order", () => {
  assert.equal(
    LOCK_CREATED_EVENT_SIGNATURE,
    "ac651265f70c23b890ceac240cb11b0afa638867e02692e17e9947adbe5c0e9b",
  );
  assert.deepEqual(constructorWords, EXPECTED_CONSTRUCTOR_WORDS);
  const decoded = decodeConditionalLockConstructorArgs(upperHex(constructorEncoded));

  assert.deepEqual(decoded, NORMALIZED_TERMS);
  assert.equal(Object.isFrozen(decoded), true);
  assert.equal(encodeConditionalLockConstructorArgs(decoded), constructorEncoded);
  assert.equal(
    joinedWords(words(encodeConditionalLockConstructorArgs(decoded), 11)),
    constructorEncoded,
  );
});

test("LockCreated decoder follows four topics and eight non-indexed data words", () => {
  const decoded = eventWithData(upperHex(eventData), eventTopics.map(upperHex));

  assert.deepEqual(decoded, NORMALIZED_TERMS);
  assert.equal(Object.isFrozen(decoded), true);
  assert.equal(encodeConditionalLockConstructorArgs(decoded), constructorEncoded);
  assert.equal(joinedWords([
    decoded.swapId,
    decoded.termsHash,
    addressWord(decoded.token),
    ...words(eventData, 8),
  ]), constructorEncoded);
});

test("claim decoder accepts exactly one bytes32 word, including a zero preimage", () => {
  assert.equal(CLAIM_SELECTOR, "bd66528a");
  const nonzero = `0x${"ab".repeat(32)}`;
  assert.equal(decodeClaimCalldata(upperHex(encodeClaimCalldata(nonzero))), nonzero);

  const zero = `0x${"00".repeat(32)}`;
  assert.equal(
    decodeClaimCalldata(`0x${CLAIM_SELECTOR}${"00".repeat(32)}`),
    zero,
  );
});

test("constructor decoder rejects width, trailing-byte, character, padding, and uint64 violations", () => {
  const malformed = new Map<string, string>([
    ["short", `0x${constructorEncoded.slice(2, -2)}`],
    ["trailing byte", `${constructorEncoded}00`],
    ["invalid character", `${constructorEncoded.slice(0, 20)}g${constructorEncoded.slice(21)}`],
    ["wrong word count", joinedWords(constructorWords.slice(0, 10))],
    ["address high padding", joinedWords(constructorWords.with(2, `0x1${constructorWords[2]!.slice(3)}`))],
    ["uint64 high bits", joinedWords(constructorWords.with(8, `0x1${constructorWords[8]!.slice(3)}`))],
  ]);

  for (const [label, value] of malformed) {
    assert.throws(() => decodeConditionalLockConstructorArgs(value), label);
  }
});

test("constructor decoder rejects zero identities, invalid roles, and deadline ordering", () => {
  const invalid = new Map<string, readonly string[]>([
    ["zero swap ID", constructorWords.with(0, `0x${"00".repeat(32)}`)],
    ["zero terms hash", constructorWords.with(1, `0x${"00".repeat(32)}`)],
    ["zero token", constructorWords.with(2, addressWord(`0x${"00".repeat(20)}`))],
    ["zero funder", constructorWords.with(3, addressWord(`0x${"00".repeat(20)}`))],
    ["zero claim recipient", constructorWords.with(4, addressWord(`0x${"00".repeat(20)}`))],
    ["zero refund recipient", constructorWords.with(5, addressWord(`0x${"00".repeat(20)}`))],
    ["zero amount", constructorWords.with(6, uintWord(0n))],
    ["zero hashlock", constructorWords.with(7, `0x${"00".repeat(32)}`)],
    ["funder equals claim recipient", constructorWords.with(4, constructorWords[3]!)],
    ["token equals funder", constructorWords.with(2, constructorWords[3]!)],
    ["token equals claim recipient", constructorWords.with(2, constructorWords[4]!)],
    ["refund recipient differs", constructorWords.with(5, addressWord("0x3333333333333333333333333333333333333333"))],
    ["funding cutoff is not before claim cutoff", constructorWords.with(8, constructorWords[9]!)],
    ["refund gap is absent", constructorWords.with(10, uintWord(TERMS.claimCutoff + 1n))],
  ]);

  for (const [label, value] of invalid) {
    assert.throws(
      () => decodeConditionalLockConstructorArgs(joinedWords(value)),
      label,
    );
  }
});

test("LockCreated decoder rejects signature, topic count, data width, padding, and identity violations", () => {
  const dataWords = words(eventData, 8);
  const invalid = new Map<string, { topics: readonly string[]; data: string }>([
    ["unknown signature", { topics: [`0x${"ff".repeat(32)}`, ...eventTopics.slice(1)], data: eventData }],
    ["short topics", { topics: eventTopics.slice(0, 3), data: eventData }],
    ["long topics", { topics: [...eventTopics, eventTopics[1]!], data: eventData }],
    ["short data", { topics: eventTopics, data: joinedWords(dataWords.slice(0, 7)) }],
    ["trailing data", { topics: eventTopics, data: `${eventData}00` }],
    ["invalid data character", { topics: eventTopics, data: `${eventData.slice(0, 18)}g${eventData.slice(19)}` }],
    ["swap ID zero", { topics: eventTopics.with(1, `0x${"00".repeat(32)}`), data: eventData }],
    ["terms hash zero", { topics: eventTopics.with(2, `0x${"00".repeat(32)}`), data: eventData }],
    ["swap ID short", { topics: eventTopics.with(1, `0x${"11".repeat(31)}`), data: eventData }],
    ["terms hash invalid character", { topics: eventTopics.with(2, `${eventTopics[2]!.slice(0, 20)}g${eventTopics[2]!.slice(21)}`), data: eventData }],
    ["token zero", { topics: eventTopics.with(3, addressWord(`0x${"00".repeat(20)}`)), data: eventData }],
    ["token high padding", { topics: eventTopics.with(3, `0x1${eventTopics[3]!.slice(3)}`), data: eventData }],
    ["funder high padding", { topics: eventTopics, data: joinedWords(dataWords.with(0, `0x1${dataWords[0]!.slice(3)}`)) }],
    ["funding cutoff high bits", { topics: eventTopics, data: joinedWords(dataWords.with(5, `0x1${dataWords[5]!.slice(3)}`)) }],
    ["zero funder", { topics: eventTopics, data: joinedWords(dataWords.with(0, addressWord(`0x${"00".repeat(20)}`))) }],
    ["zero claim recipient", { topics: eventTopics, data: joinedWords(dataWords.with(1, addressWord(`0x${"00".repeat(20)}`))) }],
    ["zero refund recipient", { topics: eventTopics, data: joinedWords(dataWords.with(2, addressWord(`0x${"00".repeat(20)}`))) }],
    ["zero amount", { topics: eventTopics, data: joinedWords(dataWords.with(3, uintWord(0n))) }],
    ["zero hashlock", { topics: eventTopics, data: joinedWords(dataWords.with(4, `0x${"00".repeat(32)}`)) }],
    ["funder equals claim recipient", { topics: eventTopics, data: joinedWords(dataWords.with(1, dataWords[0]!)) }],
    ["token equals funder", { topics: eventTopics.with(3, addressWord(TERMS.funder)), data: eventData }],
    ["refund recipient differs", { topics: eventTopics, data: joinedWords(dataWords.with(2, addressWord("0x3333333333333333333333333333333333333333"))) }],
    ["deadline order", { topics: eventTopics, data: joinedWords(dataWords.with(5, dataWords[6]!)) }],
    ["refund gap absent", { topics: eventTopics, data: joinedWords(dataWords.with(7, uintWord(TERMS.claimCutoff + 1n))) }],
  ]);

  for (const [label, value] of invalid) {
    assert.throws(() => eventWithData(value.data, value.topics), label);
  }
});

test("claim decoder rejects selector, width, trailing-byte, and character violations", () => {
  const valid = encodeClaimCalldata(`0x${"ab".repeat(32)}`);
  const malformed = new Map<string, string>([
    ["unknown selector", `0xdeadbeef${valid.slice(10)}`],
    ["short selector", `0x${CLAIM_SELECTOR}`],
    ["short word", `0x${CLAIM_SELECTOR}${"ab".repeat(31)}`],
    ["trailing word", `${valid}00`],
    ["invalid character", `${valid.slice(0, 10)}g${valid.slice(11)}`],
    ["missing prefix", valid.slice(2)],
  ]);

  for (const [label, value] of malformed) {
    assert.throws(() => decodeClaimCalldata(value), label);
  }
});
