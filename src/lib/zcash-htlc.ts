import {
  decodeTransparentAddress,
  hash160,
  p2shAddressFromRedeemScript,
  p2shScriptPubKey,
  parseP2shScriptPubKey,
  type ZcashNetwork,
} from "./zcash-transparent.ts";

export const HTLC_PREIMAGE_LENGTH = 32;
export const HTLC_DIGEST_LENGTH = 32;
export const HTLC_PKH_LENGTH = 20;
export const HTLC_MAX_REDEEM_SCRIPT_LENGTH = 520;
export const CLTV_LOCKTIME_THRESHOLD = 500_000_000;
export const CLTV_MAX_LOCKTIME = 0xffff_ffff;

const OP_0 = 0x00;
const OP_1NEGATE = 0x4f;
const OP_1 = 0x51;
const OP_16 = 0x60;
const OP_PUSHDATA1 = 0x4c;
const OP_PUSHDATA2 = 0x4d;
const OP_PUSHDATA4 = 0x4e;
const OP_IF = 0x63;
const OP_ELSE = 0x67;
const OP_ENDIF = 0x68;
const OP_DROP = 0x75;
const OP_DUP = 0x76;
const OP_SIZE = 0x82;
const OP_EQUALVERIFY = 0x88;
const OP_HASH160 = 0xa9;
const OP_SHA256 = 0xa8;
const OP_CHECKSIG = 0xac;
const OP_CHECKLOCKTIMEVERIFY = 0xb1;

const MAX_SCRIPT_NUMBER_BYTES = 5;

export type HtlcLockType = "height" | "timestamp";

export type HtlcLock = Readonly<{
  type: HtlcLockType;
  value: number;
}>;

export type HtlcParameters = Readonly<{
  digest: Uint8Array;
  claimPkh: Uint8Array;
  refundPkh: Uint8Array;
  lock: HtlcLock;
}>;

export type ZcashHtlcParameters = HtlcParameters;

export type HtlcWitnessBranch = "claim" | "refund";

export type HtlcWitnessTemplate = Readonly<{
  branch: HtlcWitnessBranch;
  stack: readonly string[];
}>;

export type HtlcMaturityContext = Readonly<{
  currentBlockHeight?: number;
  currentBlockTime?: number;
  currentTime?: number;
}>;

export type HtlcCltvEvaluationInput = HtlcMaturityContext & Readonly<{
  lock: HtlcLock;
  txLockTime: number;
  inputSequence: number;
}>;

export type HtlcCltvEvaluation = Readonly<{
  valid: boolean;
  eligible: boolean;
  passesCltv: boolean;
  mature: boolean;
  lockTypeMatches: boolean;
  transactionLockAtLeastOperand: boolean;
  inputSequenceNonFinal: boolean;
  currentStateMature: boolean;
  expectedLockType: HtlcLockType;
  transactionLockType: HtlcLockType | null;
  reason?: string;
}>;

export type HtlcStandardnessReport = Readonly<{
  validTemplate: boolean;
  isStandard: boolean;
  sigops: number;
  staticSigops: number;
  scriptLength: number;
  redeemScriptLength: number;
  maxRedeemScriptLength: number;
  within520Bytes: boolean;
  reasons: readonly string[];
}>;

function cloneBytes(value: Uint8Array): Uint8Array {
  return Uint8Array.from(value);
}

function requireBytes(value: Uint8Array, field: string, length: number): Uint8Array {
  if (!(value instanceof Uint8Array)) throw new TypeError(`HTLC ${field} must be a Uint8Array`);
  if (value.length !== length) throw new RangeError(`HTLC ${field} must be exactly ${length} bytes`);
  return cloneBytes(value);
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function isIntegerInRange(value: number, minimum: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function invalidScript(reason: string): never {
  throw new TypeError(`Invalid Zcash HTLC redeemScript: ${reason}`);
}

export function normalizeHtlcLock(lock: HtlcLock): HtlcLock {
  if (!lock || (lock.type !== "height" && lock.type !== "timestamp")) {
    throw new TypeError("HTLC lock type must be explicitly height or timestamp");
  }
  if (!Number.isSafeInteger(lock.value)) throw new TypeError("HTLC lock value must be an integer");

  if (lock.type === "height") {
    if (!isIntegerInRange(lock.value, 1, CLTV_LOCKTIME_THRESHOLD - 1)) {
      throw new RangeError("HTLC height lock must be between 1 and 499999999");
    }
  } else if (!isIntegerInRange(lock.value, CLTV_LOCKTIME_THRESHOLD, CLTV_MAX_LOCKTIME)) {
    throw new RangeError("HTLC timestamp lock must be between 500000000 and 4294967295");
  }

  return { type: lock.type, value: lock.value };
}

export function encodeMinimalScriptNumber(value: number): Uint8Array {
  if (!Number.isSafeInteger(value)) throw new TypeError("Script number must be an integer");
  if (value === 0) return new Uint8Array();

  let magnitude = BigInt(value < 0 ? -value : value);
  const negative = value < 0;
  const bytes: number[] = [];
  while (magnitude > 0n) {
    bytes.push(Number(magnitude & 0xffn));
    magnitude >>= 8n;
  }

  if ((bytes[bytes.length - 1] & 0x80) !== 0) {
    bytes.push(negative ? 0x80 : 0x00);
  } else if (negative) {
    bytes[bytes.length - 1] |= 0x80;
  }
  return Uint8Array.from(bytes);
}

export const encodeScriptNumber = encodeMinimalScriptNumber;

function isMinimalScriptNumber(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return true;
  const last = bytes[bytes.length - 1];
  if ((last & 0x7f) !== 0) return true;
  if (bytes.length === 1) return false;
  return (bytes[bytes.length - 2] & 0x80) !== 0;
}

export function decodeMinimalScriptNumber(bytes: Uint8Array, maxBytes = MAX_SCRIPT_NUMBER_BYTES): number {
  if (!(bytes instanceof Uint8Array)) throw new TypeError("Script number must be a Uint8Array");
  if (bytes.length > maxBytes) throw new RangeError(`Script number exceeds ${maxBytes} bytes`);
  if (!isMinimalScriptNumber(bytes)) throw new TypeError("Script number is not minimally encoded");
  if (bytes.length === 0) return 0;

  const negative = (bytes[bytes.length - 1] & 0x80) !== 0;
  let value = 0n;
  for (let index = 0; index < bytes.length; index += 1) {
    let byte = bytes[index];
    if (index === bytes.length - 1 && negative) byte &= 0x7f;
    value |= BigInt(byte) << BigInt(index * 8);
  }
  const signed = negative ? -value : value;
  if (signed < BigInt(Number.MIN_SAFE_INTEGER) || signed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("Script number is outside the safe integer range");
  }
  return Number(signed);
}

export const decodeScriptNumber = decodeMinimalScriptNumber;

function encodeMinimalPush(bytes: Uint8Array): Uint8Array {
  if (bytes.length === 0) return Uint8Array.of(OP_0);
  if (bytes.length === 1 && bytes[0] >= 1 && bytes[0] <= 16) return Uint8Array.of(OP_1 - 1 + bytes[0]);
  if (bytes.length === 1 && bytes[0] === 0x81) return Uint8Array.of(OP_1NEGATE);
  if (bytes.length <= 75) return Uint8Array.of(bytes.length, ...bytes);
  if (bytes.length <= 0xff) return Uint8Array.of(OP_PUSHDATA1, bytes.length, ...bytes);
  if (bytes.length <= 0xffff) {
    return Uint8Array.of(OP_PUSHDATA2, bytes.length & 0xff, bytes.length >>> 8, ...bytes);
  }
  const length = bytes.length;
  return Uint8Array.of(
    OP_PUSHDATA4,
    length & 0xff,
    (length >>> 8) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 24) & 0xff,
    ...bytes,
  );
}

type ParsedPush = Readonly<{
  data: Uint8Array;
  nextOffset: number;
}>;

function readCanonicalPush(script: Uint8Array, offset: number): ParsedPush {
  if (offset >= script.length) invalidScript("truncated push");
  const opcode = script[offset];

  if (opcode === OP_0) return { data: new Uint8Array(), nextOffset: offset + 1 };
  if (opcode === OP_1NEGATE) return { data: Uint8Array.of(0x81), nextOffset: offset + 1 };
  if (opcode >= OP_1 && opcode <= OP_16) {
    return { data: Uint8Array.of(opcode - OP_1 + 1), nextOffset: offset + 1 };
  }

  let length: number;
  let headerLength: number;
  if (opcode >= 1 && opcode <= 75) {
    length = opcode;
    headerLength = 1;
  } else if (opcode === OP_PUSHDATA1) {
    if (offset + 1 >= script.length) invalidScript("truncated OP_PUSHDATA1");
    length = script[offset + 1];
    if (length < 76) invalidScript("non-minimal OP_PUSHDATA1");
    headerLength = 2;
  } else if (opcode === OP_PUSHDATA2) {
    if (offset + 2 >= script.length) invalidScript("truncated OP_PUSHDATA2");
    length = script[offset + 1] | (script[offset + 2] << 8);
    if (length <= 0xff) invalidScript("non-minimal OP_PUSHDATA2");
    headerLength = 3;
  } else if (opcode === OP_PUSHDATA4) {
    if (offset + 4 >= script.length) invalidScript("truncated OP_PUSHDATA4");
    length = script[offset + 1]
      | (script[offset + 2] << 8)
      | (script[offset + 3] << 16)
      | (script[offset + 4] * 0x1000000);
    if (length <= 0xffff) invalidScript("non-minimal OP_PUSHDATA4");
    headerLength = 5;
  } else {
    invalidScript(`expected a canonical push, got opcode 0x${opcode.toString(16).padStart(2, "0")}`);
  }

  const dataStart = offset + headerLength;
  const nextOffset = dataStart + length;
  if (nextOffset > script.length) invalidScript("truncated pushed data");
  const data = script.slice(dataStart, nextOffset);
  if (data.length === 1 && (data[0] === 0 || (data[0] >= 1 && data[0] <= 16) || data[0] === 0x81)) {
    invalidScript("non-minimal data push");
  }
  return { data, nextOffset };
}

function expectOpcode(script: Uint8Array, offset: number, opcode: number, name: string): number {
  if (script[offset] !== opcode) {
    const found = script[offset] === undefined ? "end of script" : `0x${script[offset].toString(16).padStart(2, "0")}`;
    invalidScript(`expected ${name}, got ${found}`);
  }
  return offset + 1;
}

function requireExactPush(
  script: Uint8Array,
  offset: number,
  expected: Uint8Array,
  name: string,
): number {
  const pushed = readCanonicalPush(script, offset);
  if (!sameBytes(pushed.data, expected)) invalidScript(`${name} push is not canonical or has the wrong value`);
  return pushed.nextOffset;
}

function buildRedeemScriptParts(parameters: HtlcParameters): Uint8Array[] {
  const digest = requireBytes(parameters.digest, "digest", HTLC_DIGEST_LENGTH);
  const claimPkh = requireBytes(parameters.claimPkh, "claim public-key hash", HTLC_PKH_LENGTH);
  const refundPkh = requireBytes(parameters.refundPkh, "refund public-key hash", HTLC_PKH_LENGTH);
  const lock = normalizeHtlcLock(parameters.lock);
  const lockNumber = encodeMinimalScriptNumber(lock.value);

  return [
    Uint8Array.of(OP_IF, OP_SIZE),
    encodeMinimalPush(Uint8Array.of(HTLC_PREIMAGE_LENGTH)),
    Uint8Array.of(OP_EQUALVERIFY, OP_SHA256),
    encodeMinimalPush(digest),
    Uint8Array.of(OP_EQUALVERIFY, OP_DUP, OP_HASH160),
    encodeMinimalPush(claimPkh),
    Uint8Array.of(OP_ELSE),
    encodeMinimalPush(lockNumber),
    Uint8Array.of(OP_CHECKLOCKTIMEVERIFY, OP_DROP, OP_DUP, OP_HASH160),
    encodeMinimalPush(refundPkh),
    Uint8Array.of(OP_ENDIF, OP_EQUALVERIFY, OP_CHECKSIG),
  ];
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function buildHtlcRedeemScript(parameters: HtlcParameters): Uint8Array {
  const script = concatBytes(buildRedeemScriptParts(parameters));
  if (script.length > HTLC_MAX_REDEEM_SCRIPT_LENGTH) {
    throw new RangeError("HTLC redeemScript exceeds the 520-byte P2SH push limit");
  }
  return script;
}

export const buildZcashHtlcRedeemScript = buildHtlcRedeemScript;

export function parseHtlcRedeemScript(script: Uint8Array): HtlcParameters {
  if (!(script instanceof Uint8Array)) throw new TypeError("HTLC redeemScript must be a Uint8Array");
  if (script.length > HTLC_MAX_REDEEM_SCRIPT_LENGTH) {
    invalidScript("redeemScript exceeds the 520-byte P2SH push limit");
  }

  let offset = 0;
  offset = expectOpcode(script, offset, OP_IF, "OP_IF");
  offset = expectOpcode(script, offset, OP_SIZE, "OP_SIZE");
  offset = requireExactPush(script, offset, Uint8Array.of(HTLC_PREIMAGE_LENGTH), "preimage length");
  offset = expectOpcode(script, offset, OP_EQUALVERIFY, "OP_EQUALVERIFY");
  offset = expectOpcode(script, offset, OP_SHA256, "OP_SHA256");

  const digestPush = readCanonicalPush(script, offset);
  if (digestPush.data.length !== HTLC_DIGEST_LENGTH) invalidScript("digest must be exactly 32 bytes");
  const digest = cloneBytes(digestPush.data);
  offset = digestPush.nextOffset;
  offset = expectOpcode(script, offset, OP_EQUALVERIFY, "OP_EQUALVERIFY");
  offset = expectOpcode(script, offset, OP_DUP, "OP_DUP");
  offset = expectOpcode(script, offset, OP_HASH160, "OP_HASH160");

  const claimPush = readCanonicalPush(script, offset);
  if (claimPush.data.length !== HTLC_PKH_LENGTH) invalidScript("claim public-key hash must be exactly 20 bytes");
  const claimPkh = cloneBytes(claimPush.data);
  offset = claimPush.nextOffset;
  offset = expectOpcode(script, offset, OP_ELSE, "OP_ELSE");

  const lockPush = readCanonicalPush(script, offset);
  let lockValue: number;
  try {
    lockValue = decodeMinimalScriptNumber(lockPush.data);
  } catch (error) {
    invalidScript(error instanceof Error ? error.message : "lock is not a minimal script number");
  }
  if (!Number.isInteger(lockValue) || lockValue <= 0 || lockValue > CLTV_MAX_LOCKTIME) {
    invalidScript("lock must be a positive uint32 script number");
  }
  const lockType: HtlcLockType = lockValue < CLTV_LOCKTIME_THRESHOLD ? "height" : "timestamp";
  const lock = normalizeHtlcLock({ type: lockType, value: lockValue });
  offset = lockPush.nextOffset;
  offset = expectOpcode(script, offset, OP_CHECKLOCKTIMEVERIFY, "OP_CHECKLOCKTIMEVERIFY");
  offset = expectOpcode(script, offset, OP_DROP, "OP_DROP");
  offset = expectOpcode(script, offset, OP_DUP, "OP_DUP");
  offset = expectOpcode(script, offset, OP_HASH160, "OP_HASH160");

  const refundPush = readCanonicalPush(script, offset);
  if (refundPush.data.length !== HTLC_PKH_LENGTH) invalidScript("refund public-key hash must be exactly 20 bytes");
  const refundPkh = cloneBytes(refundPush.data);
  offset = refundPush.nextOffset;
  offset = expectOpcode(script, offset, OP_ENDIF, "OP_ENDIF");
  offset = expectOpcode(script, offset, OP_EQUALVERIFY, "OP_EQUALVERIFY");
  offset = expectOpcode(script, offset, OP_CHECKSIG, "OP_CHECKSIG");
  if (offset !== script.length) invalidScript("trailing bytes after OP_CHECKSIG");

  return { digest, claimPkh, refundPkh, lock };
}

export function validateHtlcRedeemScript(script: Uint8Array, expected?: HtlcParameters): HtlcParameters {
  const actual = parseHtlcRedeemScript(script);
  if (expected) {
    const normalized = normalizeHtlcParameters(expected);
    if (!sameBytes(actual.digest, normalized.digest)) invalidScript("digest does not match expected HTLC parameters");
    if (!sameBytes(actual.claimPkh, normalized.claimPkh)) {
      invalidScript("claim public-key hash does not match expected HTLC parameters");
    }
    if (!sameBytes(actual.refundPkh, normalized.refundPkh)) {
      invalidScript("refund public-key hash does not match expected HTLC parameters");
    }
    if (actual.lock.type !== normalized.lock.type || actual.lock.value !== normalized.lock.value) {
      invalidScript("lock does not match expected HTLC parameters");
    }
  }
  return actual;
}

export const validateZcashHtlcRedeemScript = validateHtlcRedeemScript;

export function normalizeHtlcParameters(parameters: HtlcParameters): HtlcParameters {
  if (!parameters) throw new TypeError("HTLC parameters are required");
  return {
    digest: requireBytes(parameters.digest, "digest", HTLC_DIGEST_LENGTH),
    claimPkh: requireBytes(parameters.claimPkh, "claim public-key hash", HTLC_PKH_LENGTH),
    refundPkh: requireBytes(parameters.refundPkh, "refund public-key hash", HTLC_PKH_LENGTH),
    lock: normalizeHtlcLock(parameters.lock),
  };
}

export function isHtlcRedeemScript(script: Uint8Array, expected?: HtlcParameters): boolean {
  try {
    validateHtlcRedeemScript(script, expected);
    return true;
  } catch {
    return false;
  }
}

export const isExactHtlcRedeemScript = isHtlcRedeemScript;

function scriptFor(value: HtlcParameters | Uint8Array): Uint8Array {
  if (value instanceof Uint8Array) {
    validateHtlcRedeemScript(value);
    return cloneBytes(value);
  }
  return buildHtlcRedeemScript(value);
}

function staticSigopCount(script: Uint8Array): number {
  let count = 0;
  let offset = 0;
  while (offset < script.length) {
    const opcode = script[offset];
    if (opcode >= 1 && opcode <= 75) {
      offset += opcode + 1;
      continue;
    }
    if (opcode === OP_PUSHDATA1) {
      if (offset + 1 >= script.length) break;
      offset += 2 + script[offset + 1];
      continue;
    }
    if (opcode === OP_PUSHDATA2) {
      if (offset + 2 >= script.length) break;
      offset += 3 + script[offset + 1] + (script[offset + 2] << 8);
      continue;
    }
    if (opcode === OP_PUSHDATA4) {
      if (offset + 4 >= script.length) break;
      const length = script[offset + 1]
        | (script[offset + 2] << 8)
        | (script[offset + 3] << 16)
        | (script[offset + 4] * 0x1000000);
      offset += 5 + length;
      continue;
    }
    if (opcode === OP_CHECKSIG || opcode === 0xad) count += 1;
    if (opcode === 0xae || opcode === 0xaf) count += 20;
    offset += 1;
  }
  return count;
}

export function htlcStandardnessReport(value: HtlcParameters | Uint8Array): HtlcStandardnessReport {
  const script = value instanceof Uint8Array ? cloneBytes(value) : (() => {
    try {
      return buildHtlcRedeemScript(value);
    } catch {
      return new Uint8Array();
    }
  })();
  const reasons: string[] = [];
  let validTemplate = false;
  try {
    validateHtlcRedeemScript(script);
    validTemplate = true;
  } catch (error) {
    reasons.push(error instanceof Error ? error.message : "redeemScript is not the exact HTLC template");
  }
  const within520Bytes = script.length <= HTLC_MAX_REDEEM_SCRIPT_LENGTH;
  if (!within520Bytes) reasons.push("redeemScript exceeds 520 bytes");
  const sigops = validTemplate ? 1 : staticSigopCount(script);
  return {
    validTemplate,
    isStandard: validTemplate && within520Bytes && sigops === 1,
    sigops,
    staticSigops: sigops,
    scriptLength: script.length,
    redeemScriptLength: script.length,
    maxRedeemScriptLength: HTLC_MAX_REDEEM_SCRIPT_LENGTH,
    within520Bytes,
    reasons: Object.freeze(reasons),
  };
}

export const staticHtlcStandardnessReport = htlcStandardnessReport;
export const standardnessReport = htlcStandardnessReport;

export function htlcP2shScriptPubKey(value: HtlcParameters | Uint8Array): Uint8Array {
  return p2shScriptPubKey(hash160(scriptFor(value)));
}

export const p2shScriptPubKeyForHtlc = htlcP2shScriptPubKey;
export const buildHtlcP2shScriptPubKey = htlcP2shScriptPubKey;

export function htlcP2shAddress(
  value: HtlcParameters | Uint8Array,
  network: ZcashNetwork,
): string {
  return p2shAddressFromRedeemScript(scriptFor(value), network);
}

export const p2shAddressForHtlc = htlcP2shAddress;
export const buildHtlcP2shAddress = htlcP2shAddress;

export function isHtlcP2shScriptPubKey(
  scriptPubKey: Uint8Array,
  value: HtlcParameters | Uint8Array,
): boolean {
  try {
    return sameBytes(parseP2shScriptPubKey(scriptPubKey), hash160(scriptFor(value)));
  } catch {
    return false;
  }
}

export function isHtlcP2shAddress(
  address: string,
  network: ZcashNetwork,
  value: HtlcParameters | Uint8Array,
): boolean {
  try {
    const decoded = decodeTransparentAddress(address);
    return decoded.network === network
      && decoded.type === "p2sh"
      && sameBytes(decoded.hash, hash160(scriptFor(value)));
  } catch {
    return false;
  }
}

const CLAIM_WITNESS_STACK = Object.freeze([
  "<signature>",
  "<publicKey>",
  "<preimage:32-bytes>",
  "OP_1",
] as const);
const REFUND_WITNESS_STACK = Object.freeze([
  "<signature>",
  "<publicKey>",
  "OP_0",
] as const);

export const CLAIM_WITNESS_TEMPLATE: HtlcWitnessTemplate = Object.freeze({
  branch: "claim",
  stack: CLAIM_WITNESS_STACK,
});

export const REFUND_WITNESS_TEMPLATE: HtlcWitnessTemplate = Object.freeze({
  branch: "refund",
  stack: REFUND_WITNESS_STACK,
});

export function claimWitnessTemplate(): readonly string[] {
  return CLAIM_WITNESS_STACK;
}

export function refundWitnessTemplate(): readonly string[] {
  return REFUND_WITNESS_STACK;
}

export const claimWitnessStackTemplate = claimWitnessTemplate;
export const refundWitnessStackTemplate = refundWitnessTemplate;

function transactionLockType(value: number): HtlcLockType | null {
  if (!isIntegerInRange(value, 0, CLTV_MAX_LOCKTIME)) return null;
  return value < CLTV_LOCKTIME_THRESHOLD ? "height" : "timestamp";
}

function normalizeMaturityValue(value: number | undefined): number | undefined {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

export function evaluateHtlcCltv(input: HtlcCltvEvaluationInput): HtlcCltvEvaluation;
export function evaluateHtlcCltv(
  lock: HtlcLock,
  txLockTime: number,
  inputSequence: number,
  context?: HtlcMaturityContext,
): HtlcCltvEvaluation;
export function evaluateHtlcCltv(
  first: HtlcCltvEvaluationInput | HtlcLock,
  second?: number,
  third?: number,
  fourth?: HtlcMaturityContext,
): HtlcCltvEvaluation {
  const input = "lock" in first
    ? first
    : { lock: first, txLockTime: second as number, inputSequence: third as number, ...(fourth ?? {}) };
  const lock = normalizeHtlcLock(input.lock);
  const txType = transactionLockType(input.txLockTime);
  const lockTypeMatches = txType === lock.type;
  const transactionLockAtLeastOperand = txType !== null && input.txLockTime >= lock.value;
  const inputSequenceNonFinal = isIntegerInRange(input.inputSequence, 0, 0xffff_fffe);
  const passesCltv = lockTypeMatches && transactionLockAtLeastOperand && inputSequenceNonFinal;

  const currentHeight = normalizeMaturityValue(input.currentBlockHeight);
  const currentTime = normalizeMaturityValue(input.currentBlockTime ?? input.currentTime);
  const currentStateMature = lock.type === "height"
    ? currentHeight !== undefined && currentHeight > lock.value
    : currentTime !== undefined && currentTime > lock.value;
  const mature = passesCltv && currentStateMature;

  let reason: string | undefined;
  if (!lockTypeMatches) reason = "transaction locktime type does not match the HTLC lock type";
  else if (!transactionLockAtLeastOperand) reason = "transaction locktime is earlier than the CLTV operand";
  else if (!inputSequenceNonFinal) reason = "CLTV spending input sequence is final";
  else if (lock.type === "height" && currentHeight === undefined) {
    reason = "current block height is required for conservative maturity evaluation";
  } else if (lock.type === "timestamp" && currentTime === undefined) {
    reason = "current block time is required for conservative maturity evaluation";
  } else if (!currentStateMature) {
    reason = lock.type === "height"
      ? "current block height must be strictly greater than the CLTV operand"
      : "current block time must be strictly greater than the CLTV operand";
  }

  return {
    valid: mature,
    eligible: mature,
    passesCltv,
    mature,
    lockTypeMatches,
    transactionLockAtLeastOperand,
    inputSequenceNonFinal,
    currentStateMature,
    expectedLockType: lock.type,
    transactionLockType: txType,
    ...(reason ? { reason } : {}),
  };
}

export const evaluateCltv = evaluateHtlcCltv;
export const evaluateHtlcRefundCltv = evaluateHtlcCltv;

export function isHtlcRefundMature(input: HtlcCltvEvaluationInput): boolean {
  return evaluateHtlcCltv(input).eligible;
}
