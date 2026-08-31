// Atomic-swap P2SH script builders for the ZEC leg. The script encodes
// two terminal outcomes of one fill. The claim branch reveals the
// preimage and signs with the buyer's key. The refund branch waits for
// the lock time and signs with the seller's key. The lock time is a
// 4-byte little-endian unix timestamp checked by OP_CHECKLOCKTIMEVERIFY.
//
// The script is a single byte string. The matcher, the wallet adapter,
// and the offchain observers all reconstruct the same bytes from the
// same fill terms; any divergence is a stop condition.

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
  // Find OP_ELSE inside
  const elseIdx = script.indexOf(OP.OP_ELSE);
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

function extractHash160(claim: Uint8Array): Uint8Array {
  // Claim is: OP_HASH160 <push 20 bytes> OP_EQUALVERIFY OP_CHECKSIG
  if (claim[0] !== OP.OP_HASH160) throw new RangeError("Claim must start with OP_HASH160");
  const pushLen = claim[1];
  if (pushLen !== 20) throw new RangeError(`Claim hash push must be 20 bytes, got ${pushLen}`);
  return claim.subarray(2, 22);
}

function extractTrailingPubkey(branch: Uint8Array): CompressedPubkey {
  if (branch[branch.length - 1] !== OP.OP_CHECKSIG) {
    throw new RangeError("Branch must end with OP_CHECKSIG");
  }
  const pubkeyBytes = branch.subarray(branch.length - 34, branch.length - 1);
  return parseCompressedPubkey(pubkeyBytes);
}

function extractLockTime(refund: Uint8Array): bigint {
  if (refund[0] === 0x4f) {
    return 0n;
  }
  const pushLen = refund[0];
  if (pushLen === undefined || pushLen < 1 || pushLen > 4) {
    throw new RangeError("Refund lock-time push has unexpected length");
  }
  let value = 0n;
  for (let i = 0; i < pushLen; i++) value |= BigInt(refund[1 + i]) << BigInt(8 * i);
  return value;
}
