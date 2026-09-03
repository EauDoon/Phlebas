// Exact TypeScript ABI surface for contracts/src/swap/IConditionalLock.sol.

import { bytesToHex, hexToBytes, keccak256 } from "./keccak.ts";

const FUND_TYPE = "fund()";
const CLAIM_TYPE = "claim(bytes32)";
const REFUND_TYPE = "refund()";
const VERIFY_PREIMAGE_TYPE = "verifyPreimage(bytes32)";
const UINT256_MAX = (1n << 256n) - 1n;
const UINT64_MAX = (1n << 64n) - 1n;
const ZERO_WORD = `0x${"00".repeat(32)}`;
const ZERO_ADDRESS = `0x${"00".repeat(20)}`;

function selector(signature: string): string {
  return bytesToHex(
    keccak256(new TextEncoder().encode(signature)).slice(0, 4),
  );
}

function eventSignature(signature: string): string {
  return bytesToHex(keccak256(new TextEncoder().encode(signature)));
}

export const FUND_SELECTOR = selector(FUND_TYPE);
export const CLAIM_SELECTOR = selector(CLAIM_TYPE);
export const REFUND_SELECTOR = selector(REFUND_TYPE);
export const VERIFY_PREIMAGE_SELECTOR = selector(VERIFY_PREIMAGE_TYPE);

export const LOCK_CREATED_EVENT_SIGNATURE = eventSignature(
  "LockCreated(bytes32,bytes32,address,address,address,address,uint256,bytes32,uint64,uint64,uint64)",
);
export const FUNDED_EVENT_SIGNATURE = eventSignature(
  "Funded(bytes32,address,address,uint256)",
);
export const CLAIMED_EVENT_SIGNATURE = eventSignature(
  "Claimed(bytes32,address,uint256)",
);
export const REFUNDED_EVENT_SIGNATURE = eventSignature(
  "Refunded(bytes32,address,uint256)",
);

const LOCK_CREATED_TOPIC = `0x${LOCK_CREATED_EVENT_SIGNATURE}`;

export interface ConditionalLockTerms {
  swapId: string;
  termsHash: string;
  token: string;
  funder: string;
  claimRecipient: string;
  refundRecipient: string;
  amount: bigint;
  hashlock: string;
  fundingCutoff: bigint;
  claimCutoff: bigint;
  refundTime: bigint;
}

function wordAddress(address: string): Uint8Array {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new RangeError(`address must be 20 bytes: ${address}`);
  }
  const raw = address.slice(2).toLowerCase();
  return hexToBytes(raw.padStart(64, "0"));
}

function wordUint(value: bigint): Uint8Array {
  if (value < 0n || value > UINT256_MAX) {
    throw new RangeError(`uint256 out of range: ${value}`);
  }
  return hexToBytes(value.toString(16).padStart(64, "0"));
}

function wordUint64(value: bigint): Uint8Array {
  if (value < 0n || value > UINT64_MAX) {
    throw new RangeError(`uint64 out of range: ${value}`);
  }
  return wordUint(value);
}

function wordBytes32(hex: string): Uint8Array {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    throw new RangeError(`bytes32 must be 32 bytes: ${hex}`);
  }
  const raw = hex.slice(2).toLowerCase();
  return hexToBytes(raw);
}

function assertNonzeroWord(name: string, value: string): void {
  if (value.toLowerCase() === ZERO_WORD) {
    throw new RangeError(`${name} must not be zero`);
  }
}

function assertNonzeroAddress(name: string, value: string): void {
  if (value.toLowerCase() === ZERO_ADDRESS) {
    throw new RangeError(`${name} must not be zero`);
  }
}

function validateTerms(terms: ConditionalLockTerms): void {
  wordBytes32(terms.swapId);
  wordBytes32(terms.termsHash);
  wordAddress(terms.token);
  wordAddress(terms.funder);
  wordAddress(terms.claimRecipient);
  wordAddress(terms.refundRecipient);
  wordUint(terms.amount);
  wordBytes32(terms.hashlock);
  wordUint64(terms.fundingCutoff);
  wordUint64(terms.claimCutoff);
  wordUint64(terms.refundTime);

  assertNonzeroWord("swapId", terms.swapId);
  assertNonzeroWord("termsHash", terms.termsHash);
  assertNonzeroWord("hashlock", terms.hashlock);
  assertNonzeroAddress("token", terms.token);
  assertNonzeroAddress("funder", terms.funder);
  assertNonzeroAddress("claimRecipient", terms.claimRecipient);
  assertNonzeroAddress("refundRecipient", terms.refundRecipient);
  if (terms.amount === 0n) throw new RangeError("amount must be positive");
  if (terms.funder.toLowerCase() === terms.claimRecipient.toLowerCase()) {
    throw new RangeError("funder and claimRecipient must differ");
  }
  if (
    terms.token.toLowerCase() === terms.funder.toLowerCase()
    || terms.token.toLowerCase() === terms.claimRecipient.toLowerCase()
  ) {
    throw new RangeError("token must differ from both user roles");
  }
  if (terms.funder.toLowerCase() !== terms.refundRecipient.toLowerCase()) {
    throw new RangeError("refundRecipient must equal funder");
  }
  if (
    terms.fundingCutoff >= terms.claimCutoff
    || terms.claimCutoff + 1n >= terms.refundTime
  ) {
    throw new RangeError("deadlines must increase and leave a refund gap");
  }
}

function splitWords(encoded: string, count: number, name: string): string[] {
  if (
    typeof encoded !== "string"
    || encoded.length !== 2 + count * 64
    || !/^0x[0-9a-fA-F]*$/.test(encoded)
  ) {
    throw new RangeError(`${name} must contain exactly ${count} ABI words`);
  }
  return Array.from({ length: count }, (_, index) => (
    `0x${encoded.slice(2 + index * 64, 2 + (index + 1) * 64)}`.toLowerCase()
  ));
}

function decodeAddressWord(word: string, name: string): string {
  if (!/^0x0{24}[0-9a-fA-F]{40}$/.test(word)) {
    throw new RangeError(`${name} must be a zero-left-padded ABI address word`);
  }
  return `0x${word.slice(26).toLowerCase()}`;
}

// Structural decoding does not establish deployment, receipt, inclusion, finality, or authority.
export function decodeConditionalLockConstructorArgs(
  encoded: string,
): ConditionalLockTerms {
  const words = splitWords(encoded, 11, "constructor arguments");
  const terms: ConditionalLockTerms = {
    swapId: words[0],
    termsHash: words[1],
    token: decodeAddressWord(words[2], "token"),
    funder: decodeAddressWord(words[3], "funder"),
    claimRecipient: decodeAddressWord(words[4], "claimRecipient"),
    refundRecipient: decodeAddressWord(words[5], "refundRecipient"),
    amount: BigInt(words[6]),
    hashlock: words[7],
    fundingCutoff: BigInt(words[8]),
    claimCutoff: BigInt(words[9]),
    refundTime: BigInt(words[10]),
  };
  validateTerms(terms);
  return Object.freeze(terms);
}

export function decodeConditionalLockCreatedLog(
  topics: readonly string[],
  data: string,
): ConditionalLockTerms {
  if (!Array.isArray(topics) || topics.length !== 4) {
    throw new RangeError("LockCreated must contain exactly four topics");
  }
  const signature = splitWords(topics[0], 1, "LockCreated signature")[0];
  if (signature !== LOCK_CREATED_TOPIC) {
    throw new RangeError("unexpected LockCreated event signature");
  }
  const indexedWords = topics.slice(1).flatMap((topic, index) => (
    splitWords(topic, 1, `LockCreated topic ${index + 1}`)
  ));
  const dataWords = splitWords(data, 8, "LockCreated data");
  return decodeConditionalLockConstructorArgs(`0x${[
    ...indexedWords,
    ...dataWords,
  ].map((word) => word.slice(2)).join("")}`);
}

export function decodeClaimCalldata(calldata: string): string {
  if (
    typeof calldata !== "string"
    || calldata.length !== 74
    || !calldata.startsWith("0x")
    || calldata.slice(0, 10).toLowerCase() !== `0x${CLAIM_SELECTOR}`
  ) {
    throw new RangeError("claim calldata must be exactly selector plus bytes32");
  }
  return splitWords(`0x${calldata.slice(10)}`, 1, "claim preimage")[0];
}

export function encodeConditionalLockConstructorArgs(
  terms: ConditionalLockTerms,
): string {
  validateTerms(terms);
  const encoded = new Uint8Array([
    ...wordBytes32(terms.swapId),
    ...wordBytes32(terms.termsHash),
    ...wordAddress(terms.token),
    ...wordAddress(terms.funder),
    ...wordAddress(terms.claimRecipient),
    ...wordAddress(terms.refundRecipient),
    ...wordUint(terms.amount),
    ...wordBytes32(terms.hashlock),
    ...wordUint64(terms.fundingCutoff),
    ...wordUint64(terms.claimCutoff),
    ...wordUint64(terms.refundTime),
  ]);
  return `0x${bytesToHex(encoded)}`;
}

export function encodeFundCalldata(): string {
  return `0x${FUND_SELECTOR}`;
}

export function encodeClaimCalldata(preimage: string): string {
  return `0x${CLAIM_SELECTOR}${bytesToHex(wordBytes32(preimage))}`;
}

export function encodeRefundCalldata(): string {
  return `0x${REFUND_SELECTOR}`;
}

export function encodeVerifyPreimageCalldata(preimage: string): string {
  return `0x${VERIFY_PREIMAGE_SELECTOR}${bytesToHex(wordBytes32(preimage))}`;
}
