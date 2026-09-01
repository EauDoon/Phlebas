// Zcash observer for an explicitly selected transparent P2SH lock network. The observer watches
// public transparent outpoints and classifies a terminal spend only from
// the exact input that spends the expected outpoint. It never holds a key,
// signs, extracts, or broadcasts a transaction.

import { ECDH, createHash } from "node:crypto";

import {
  evaluateHtlcCltv,
  isHtlcP2shAddress,
  validateHtlcRedeemScript,
} from "./zcash-htlc.ts";
import { hash160, type ZcashNetwork } from "./zcash-transparent.ts";
import { hexToBytes } from "./keccak.ts";

const MAX_SCRIPT_SIG_LENGTH = 1_650;
const MAX_TRANSPARENT_INPUTS = 10_000;
const SIGHASH_ALL = 0x01;

export type ZcashOutpointKind = "funded" | "claimed" | "refunded";

export type ZcashOutpointEvent = Readonly<{
  kind: ZcashOutpointKind;
  txid: string;
  vout: number;
  address: string;
  amountZatoshis: bigint;
  blockHeight: bigint;
}>;

export type ZcashTransparentInputEvidence = Readonly<{
  prevTxid: string;
  prevVout: number;
  scriptSigHex: string;
  sequence: number;
}>;

export type ZcashSpendEvidence =
  | Readonly<{ spent: false; spendTxid: null }>
  | Readonly<{
    spent: true;
    spendTxid: string;
    lockTime: number;
    transparentInputs: ReadonlyArray<ZcashTransparentInputEvidence>;
  }>;

export type ZcashEventSource = Readonly<{
  fetchAddressOutpoints: (address: string) => Promise<ReadonlyArray<{
    txid: string;
    vout: number;
    amountZatoshis: bigint;
    blockHeight: bigint;
  }>>;
  fetchSpend: (txid: string, vout: number) => Promise<ZcashSpendEvidence>;
}>;

export type ZcashObserverConfig = Readonly<{
  network: ZcashNetwork;
  addresses: ReadonlyArray<string>;
  fromHeight: bigint;
  source: ZcashEventSource;
  expectedRedeemScriptByOutpoint?: Readonly<Record<string, string>>;
}>;

type ParsedPush = Readonly<{ data: Uint8Array; nextOffset: number }>;

function fail(outpoint: string, reason: string): never {
  throw new Error(`Unverifiable Zcash spend for ${outpoint}: ${reason}`);
}

function exactNetwork(value: unknown): ZcashNetwork {
  if (value !== "testnet" && value !== "mainnet") {
    throw new TypeError("Zcash observer network must be exactly testnet or mainnet");
  }
  return value;
}

function exactTxid(value: string, label: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new TypeError(`${label} must be 32 lowercase hexadecimal bytes`);
  }
  return value;
}

function uint32(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new RangeError(`${label} must be an unsigned 32-bit integer`);
  }
  return value;
}

function outpointKey(txid: string, vout: number): string {
  return `${exactTxid(txid, "Zcash outpoint transaction ID")}:${uint32(vout, "Zcash outpoint index")}`;
}

function exactHex(value: string, label: string, maximumBytes?: number): Uint8Array {
  if (typeof value !== "string" || value.length === 0 || value.length % 2 !== 0 || !/^[0-9a-f]+$/.test(value)) {
    throw new TypeError(`${label} must be non-empty lowercase hexadecimal`);
  }
  if (maximumBytes !== undefined && value.length > maximumBytes * 2) {
    throw new RangeError(`${label} exceeds ${maximumBytes} bytes`);
  }
  const bytes = hexToBytes(value);
  return bytes;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function readCanonicalPush(script: Uint8Array, offset: number): ParsedPush {
  if (offset >= script.length) throw new TypeError("scriptSig contains a truncated push");
  const opcode = script[offset];

  if (opcode === 0x00) return { data: new Uint8Array(), nextOffset: offset + 1 };
  if (opcode >= 0x51 && opcode <= 0x60) {
    return { data: Uint8Array.of(opcode - 0x50), nextOffset: offset + 1 };
  }

  let length: number;
  let headerLength: number;
  if (opcode >= 1 && opcode <= 75) {
    length = opcode;
    headerLength = 1;
  } else if (opcode === 0x4c) {
    if (offset + 1 >= script.length) throw new TypeError("scriptSig contains a truncated OP_PUSHDATA1");
    length = script[offset + 1];
    if (length < 76) throw new TypeError("scriptSig contains a non-minimal OP_PUSHDATA1");
    headerLength = 2;
  } else if (opcode === 0x4d) {
    if (offset + 2 >= script.length) throw new TypeError("scriptSig contains a truncated OP_PUSHDATA2");
    length = script[offset + 1] | (script[offset + 2] << 8);
    if (length <= 0xff) throw new TypeError("scriptSig contains a non-minimal OP_PUSHDATA2");
    headerLength = 3;
  } else {
    throw new TypeError("scriptSig must contain only canonical data pushes");
  }

  const dataStart = offset + headerLength;
  const nextOffset = dataStart + length;
  if (nextOffset > script.length) throw new TypeError("scriptSig contains truncated pushed data");
  const data = script.slice(dataStart, nextOffset);
  if (data.length === 1 && (data[0] === 0 || (data[0] >= 1 && data[0] <= 16) || data[0] === 0x81)) {
    throw new TypeError("scriptSig contains a non-minimal data push");
  }
  return { data, nextOffset };
}

function parsePushOnlyScriptSig(scriptSigHex: string): readonly Uint8Array[] {
  const script = exactHex(scriptSigHex, "transparent input scriptSig", MAX_SCRIPT_SIG_LENGTH);
  const pushes: Uint8Array[] = [];
  let offset = 0;
  while (offset < script.length) {
    const push = readCanonicalPush(script, offset);
    pushes.push(push.data);
    offset = push.nextOffset;
  }
  return pushes;
}

function isCanonicalDerInteger(bytes: Uint8Array): boolean {
  return bytes.length > 0
    && (bytes[0] & 0x80) === 0
    && !(bytes.length > 1 && bytes[0] === 0 && (bytes[1] & 0x80) === 0);
}

function requireCanonicalSignature(bytes: Uint8Array): void {
  if (bytes.length < 9 || bytes.length > 73 || bytes[bytes.length - 1] !== SIGHASH_ALL) {
    throw new TypeError("witness signature must be canonical DER with SIGHASH_ALL");
  }
  const der = bytes.slice(0, -1);
  if (der[0] !== 0x30 || der[1] !== der.length - 2 || der[2] !== 0x02) {
    throw new TypeError("witness signature is not canonical DER");
  }
  const rLength = der[3];
  const rStart = 4;
  const sTag = rStart + rLength;
  if (sTag + 2 > der.length || der[sTag] !== 0x02) throw new TypeError("witness signature has invalid DER integers");
  const sLength = der[sTag + 1];
  const sStart = sTag + 2;
  if (sStart + sLength !== der.length
    || !isCanonicalDerInteger(der.slice(rStart, sTag))
    || !isCanonicalDerInteger(der.slice(sStart))) {
    throw new TypeError("witness signature has non-canonical DER integers");
  }
}

function requireBranchPublicKey(publicKey: Uint8Array, expectedHash: Uint8Array): void {
  if (publicKey.length !== 33 || (publicKey[0] !== 0x02 && publicKey[0] !== 0x03)) {
    throw new TypeError("witness public key must be a compressed SEC1 public key");
  }
  try {
    ECDH.convertKey(publicKey, "secp256k1", undefined, undefined, "compressed");
  } catch {
    throw new TypeError("witness public key is not a valid secp256k1 point");
  }
  if (!sameBytes(hash160(publicKey), expectedHash)) {
    throw new Error("witness public key does not match the selected HTLC branch");
  }
}

function classifyMatchedInput(
  outpoint: string,
  input: ZcashTransparentInputEvidence,
  lockTime: number,
  expectedRedeemScriptHex: string,
): "claimed" | "refunded" {
  const expectedRedeemScript = exactHex(expectedRedeemScriptHex, "expected HTLC redeemScript", 520);
  const htlc = validateHtlcRedeemScript(expectedRedeemScript);
  uint32(input.sequence, "spending input sequence");
  const pushes = parsePushOnlyScriptSig(input.scriptSigHex);
  const redeemScript = pushes.at(-1);
  if (!redeemScript || !sameBytes(redeemScript, expectedRedeemScript)) {
    fail(outpoint, "scriptSig does not reveal the exact expected redeemScript");
  }

  if (pushes.length === 5 && sameBytes(pushes[3], Uint8Array.of(1))) {
    requireCanonicalSignature(pushes[0]);
    requireBranchPublicKey(pushes[1], htlc.claimPkh);
    if (pushes[2].length !== 32) fail(outpoint, "claim preimage is not exactly 32 bytes");
    const digest = createHash("sha256").update(pushes[2]).digest();
    if (!sameBytes(digest, htlc.digest)) fail(outpoint, "claim preimage does not satisfy the HTLC hashlock");
    return "claimed";
  }

  if (pushes.length === 4 && pushes[2].length === 0) {
    requireCanonicalSignature(pushes[0]);
    requireBranchPublicKey(pushes[1], htlc.refundPkh);
    const cltv = evaluateHtlcCltv({
      lock: htlc.lock,
      txLockTime: uint32(lockTime, "spending transaction locktime"),
      inputSequence: uint32(input.sequence, "spending input sequence"),
    });
    if (!cltv.passesCltv) fail(outpoint, cltv.reason ?? "refund input does not satisfy CLTV");
    return "refunded";
  }

  fail(outpoint, "scriptSig does not match the exact claim or refund witness shape");
}

function classifySpend(
  outpoint: string,
  address: string,
  network: ZcashNetwork,
  expectedRedeemScriptHex: string | undefined,
  spend: Extract<ZcashSpendEvidence, { spent: true }>,
): "claimed" | "refunded" {
  exactTxid(spend.spendTxid, "Spending transaction ID");
  uint32(spend.lockTime, "Spending transaction locktime");
  if (!Array.isArray(spend.transparentInputs) || spend.transparentInputs.length > MAX_TRANSPARENT_INPUTS) {
    fail(outpoint, "parsed transparent inputs are absent or exceed the observer bound");
  }
  if (!expectedRedeemScriptHex) fail(outpoint, "no expected redeemScript is configured for the outpoint");
  const expectedRedeemScript = exactHex(expectedRedeemScriptHex, "expected HTLC redeemScript", 520);
  validateHtlcRedeemScript(expectedRedeemScript);
  if (!isHtlcP2shAddress(address, network, expectedRedeemScript)) {
    fail(outpoint, `watched address is not the ${network} P2SH address for the expected redeemScript`);
  }

  const matchingInputs = spend.transparentInputs.filter((input) => {
    try {
      return outpointKey(input.prevTxid, input.prevVout) === outpoint;
    } catch {
      return false;
    }
  });
  if (matchingInputs.length !== 1) {
    fail(outpoint, `expected exactly one matching transparent input, got ${matchingInputs.length}`);
  }
  return classifyMatchedInput(outpoint, matchingInputs[0], spend.lockTime, expectedRedeemScriptHex);
}

export async function pollZcashOnce(config: ZcashObserverConfig): Promise<ReadonlyArray<ZcashOutpointEvent>> {
  const network = exactNetwork(config.network);
  const events: ZcashOutpointEvent[] = [];
  for (const address of config.addresses) {
    const outpoints = await config.source.fetchAddressOutpoints(address);
    for (const out of outpoints) {
      const key = outpointKey(out.txid, out.vout);
      const spend = await config.source.fetchSpend(out.txid, out.vout);
      let kind: ZcashOutpointKind;
      if (spend.spent === false) {
        if (spend.spendTxid !== null) fail(key, "unspent evidence names a spending transaction");
        kind = "funded";
      } else if (spend.spent === true) {
        kind = classifySpend(key, address, network, config.expectedRedeemScriptByOutpoint?.[key], spend);
      } else {
        fail(key, "spend evidence does not contain an explicit spent state");
      }
      events.push({
        kind,
        txid: out.txid,
        vout: out.vout,
        address,
        amountZatoshis: out.amountZatoshis,
        blockHeight: out.blockHeight,
      });
    }
  }
  return events;
}
