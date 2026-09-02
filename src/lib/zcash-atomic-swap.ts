// Superseded HASH160 script demonstration retained for historical vectors.
// It is not the canonical SHA-256 transaction-lab template, a wallet input,
// a cross-chain commitment, or a funding surface.

import { concatBytes, OP, pushData, pushNumber } from "./zcash-script.ts";
import { parseCompressedPubkey, type CompressedPubkey } from "./zcash-pubkey.ts";

export type AtomicSwapParams = Readonly<{
  hash20: Uint8Array;
  buyerPubkey: CompressedPubkey;
  sellerPubkey: CompressedPubkey;
  lockTime: bigint;
}>;

export function buildClaimBranch(hash20: Uint8Array, pubkey: Uint8Array): Uint8Array {
  if (hash20.length !== 20) {
    throw new RangeError(`Hash20 must be 20 bytes, got ${hash20.length}`);
  }
  if (pubkey.length !== 33) {
    throw new RangeError(`Claim pubkey must be 33 bytes, got ${pubkey.length}`);
  }
  return concatBytes([
    new Uint8Array([OP.OP_HASH160]),
    pushData(hash20),
    new Uint8Array([OP.OP_EQUALVERIFY]),
    pushData(pubkey),
    new Uint8Array([OP.OP_CHECKSIG]),
  ]);
}

export function buildRefundBranch(lockTime: bigint, pubkey: Uint8Array): Uint8Array {
  if (lockTime < 0n || lockTime > 0xffffffffn) {
    throw new RangeError(`Lock time must fit uint32, got ${lockTime}`);
  }
  if (pubkey.length !== 33) {
    throw new RangeError(`Refund pubkey must be 33 bytes, got ${pubkey.length}`);
  }
  return concatBytes([
    pushNumber(lockTime),
    new Uint8Array([OP.OP_CHECKLOCKTIMEVERIFY]),
    new Uint8Array([OP.OP_DROP]),
    pushData(pubkey),
    new Uint8Array([OP.OP_CHECKSIG]),
  ]);
}

export function buildAtomicSwapScript(params: AtomicSwapParams): Uint8Array {
  if (params.hash20.length !== 20) {
    throw new RangeError(`Hash20 must be 20 bytes, got ${params.hash20.length}`);
  }
  if (params.buyerPubkey.parity === params.sellerPubkey.parity
      && bytesEqual(params.buyerPubkey.x, params.sellerPubkey.x)) {
    throw new RangeError("Buyer and seller pubkeys must differ");
  }
  return concatBytes([
    new Uint8Array([OP.OP_IF]),
    buildClaimBranch(params.hash20, encodePubkey(params.buyerPubkey)),
    new Uint8Array([OP.OP_ELSE]),
    buildRefundBranch(params.lockTime, encodePubkey(params.sellerPubkey)),
    new Uint8Array([OP.OP_ENDIF]),
  ]);
}

function encodePubkey(pubkey: { parity: 0x02 | 0x03; x: Uint8Array }): Uint8Array {
  const out = new Uint8Array(33);
  out[0] = pubkey.parity;
  out.set(pubkey.x, 1);
  return out;
}

export function parseAtomicSwapScript(script: Uint8Array): AtomicSwapParams {
  if (script.length < 4) throw new RangeError("Script too short");
  if (script[0] !== OP.OP_IF) throw new RangeError("Script must start with OP_IF");
  // The last byte must be OP_ENDIF
  if (script[script.length - 1] !== OP.OP_ENDIF) throw new RangeError("Script must end with OP_ENDIF");
  const elseIdx = findTopLevelElse(script);
  if (elseIdx < 0) throw new RangeError("Script missing OP_ELSE");
  // Parse claim and refund by stripping the IF/ELSE/ENDIF markers.
  const claim = script.subarray(1, elseIdx);
  const refund = script.subarray(elseIdx + 1, script.length - 1);
  return {
    hash20: extractHash160(claim),
    buyerPubkey: extractTrailingPubkey(claim),
    sellerPubkey: extractTrailingPubkey(refund),
    lockTime: extractLockTime(refund),
  };
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Index of the OP_ELSE that separates the two branches.
 *
 * A raw byte scan for 0x67 is not enough: pushed data is not opcodes, and
 * hash20 or either public key can contain the byte 0x67, which would split
 * the script in the middle of a push. Walking the pushes skips their
 * payloads, so only a real opcode position can match.
 */
function findTopLevelElse(script: Uint8Array): number {
  let offset = 1; // past OP_IF
  while (offset < script.length) {
    const opcode = script[offset]!;
    if (opcode === OP.OP_ELSE) return offset;
    if (opcode >= 0x01 && opcode <= 0x4b) {
      offset += 1 + opcode;
      continue;
    }
    if (opcode === 0x4c) {
      const length = script[offset + 1];
      if (length === undefined) throw new RangeError("Truncated OP_PUSHDATA1");
      offset += 2 + length;
      continue;
    }
    if (opcode === 0x4d || opcode === 0x4e) {
      throw new RangeError("Atomic-swap scripts do not use OP_PUSHDATA2 or OP_PUSHDATA4");
    }
    offset += 1;
  }
  return -1;
}

function extractHash160(claim: Uint8Array): Uint8Array {
  // Claim is: OP_HASH160 <push 20 bytes> OP_EQUALVERIFY OP_CHECKSIG
  if (claim[0] !== OP.OP_HASH160) throw new RangeError("Claim must start with OP_HASH160");
  const pushLen = claim[1];
  if (pushLen !== 20) throw new RangeError(`Claim hash push must be 20 bytes, got ${pushLen}`);
  // Copied, not a view: a returned subarray would alias the script bytes.
  return claim.slice(2, 22);
}

function extractTrailingPubkey(branch: Uint8Array): CompressedPubkey {
  if (branch[branch.length - 1] !== OP.OP_CHECKSIG) {
    throw new RangeError("Branch must end with OP_CHECKSIG");
  }
  const pubkeyBytes = branch.subarray(branch.length - 34, branch.length - 1);
  return parseCompressedPubkey(pubkeyBytes);
}

/**
 * Read the CLTV operand from the refund branch.
 *
 * The branch is `<lock time> OP_CHECKLOCKTIMEVERIFY OP_DROP <pubkey>
 * OP_CHECKSIG`, and the operand is a minimally encoded CScriptNum. Three
 * things this used to get wrong, each of which accepts or produces a
 * deadline that is not the one either party signed:
 *
 *  - 0x4f was mapped to lock time 0. 0x4f is OP_1NEGATE, a push of -1.
 *    BIP 65 fails a negative operand outright, so a script carrying it
 *    has no working refund branch at all, and reporting it as 0 says the
 *    opposite: that the refund is already claimable.
 *  - A push longer than four bytes was rejected. A uint32 at or above
 *    0x80000000 needs five, four magnitude bytes plus the sign pad, so
 *    half the domain could not be read back.
 *  - Nothing checked that OP_CHECKLOCKTIMEVERIFY followed the push, so a
 *    branch with no CLTV at all parsed as a valid deadline.
 */
function extractLockTime(refund: Uint8Array): bigint {
  const opcode = refund[0];
  if (opcode === undefined) throw new RangeError("Refund branch is empty");
  let pushLen: number;
  if (opcode === OP.OP_FALSE) {
    pushLen = 0;
  } else if (opcode >= 0x01 && opcode <= 0x05) {
    pushLen = opcode;
  } else {
    throw new RangeError("Refund lock-time push has unexpected length");
  }
  if (refund[1 + pushLen] !== OP.OP_CHECKLOCKTIMEVERIFY) {
    throw new RangeError("Refund lock time must be followed by OP_CHECKLOCKTIMEVERIFY");
  }
  if (refund[2 + pushLen] !== OP.OP_DROP) {
    throw new RangeError("OP_CHECKLOCKTIMEVERIFY must be followed by OP_DROP");
  }
  if (pushLen === 0) return 0n;
  const bytes = refund.subarray(1, 1 + pushLen);
  const top = bytes[pushLen - 1]!;
  if (top === 0x00 && (pushLen < 2 || (bytes[pushLen - 2]! & 0x80) === 0)) {
    throw new RangeError("Refund lock time is not minimally encoded");
  }
  if ((top & 0x80) !== 0) {
    throw new RangeError("Refund lock time must not be negative");
  }
  let value = 0n;
  for (let i = 0; i < pushLen; i++) value |= BigInt(bytes[i]!) << BigInt(8 * i);
  if (value > 0xffffffffn) throw new RangeError("Refund lock time must fit uint32");
  return value;
}
