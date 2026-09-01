// EVM half of the native ZEC atomic swap. One lock per matched fill.
// See contracts/src/swap/IConditionalLock.sol and docs/adr/0003-evm-conditional-lock.md.
//
// This file is the single source of truth for the lock ABI as seen by the
// browser and by any TypeScript-side offchain workflow. The selector strings
// and the parameter encoders here must stay byte-compatible with the
// Solidity contract. `conditional-lock-abi.test.ts` pins the selectors.

import { bytesToHex, hexToBytes, keccak256 } from "./keccak.ts";

const DEPOSIT_TYPE =
  "deposit((address,uint256,bytes32,uint64,address,address))";
const CLAIM_TYPE = "claim(uint256,bytes32)";
const REFUND_TYPE = "refund(uint256)";
const PAUSE_TYPE = "pause()";
const UNPAUSE_TYPE = "unpause()";

export const DEPOSIT_SELECTOR = bytesToHex(
  keccak256(new TextEncoder().encode(DEPOSIT_TYPE)).slice(0, 4),
);
export const CLAIM_SELECTOR = bytesToHex(
  keccak256(new TextEncoder().encode(CLAIM_TYPE)).slice(0, 4),
);
export const REFUND_SELECTOR = bytesToHex(
  keccak256(new TextEncoder().encode(REFUND_TYPE)).slice(0, 4),
);
export const PAUSE_SELECTOR = bytesToHex(
  keccak256(new TextEncoder().encode(PAUSE_TYPE)).slice(0, 4),
);
export const UNPAUSE_SELECTOR = bytesToHex(
  keccak256(new TextEncoder().encode(UNPAUSE_TYPE)).slice(0, 4),
);

export const DEPOSIT_EVENT_SIGNATURE = bytesToHex(
  keccak256(
    new TextEncoder().encode(
      "Deposited(uint256,address,address,uint256,bytes32,uint64,address,address)",
    ),
  ),
);
export const CLAIM_EVENT_SIGNATURE = bytesToHex(
  keccak256(
    new TextEncoder().encode("Claimed(uint256,address,uint256)"),
  ),
);
export const REFUND_EVENT_SIGNATURE = bytesToHex(
  keccak256(
    new TextEncoder().encode("Refunded(uint256,address,uint256)"),
  ),
);
export const PAUSE_SET_EVENT_SIGNATURE = bytesToHex(
  keccak256(new TextEncoder().encode("PauseSet(bool)")),
);

export interface LockParams {
  token: string;
  amount: bigint;
  hashlock: string;
  refundAfter: bigint;
  refundTo: string;
  claimTo: string;
}

function wordAddress(addr: string): Uint8Array {
  const raw = addr.toLowerCase().replace(/^0x/, "");
  if (raw.length !== 40) throw new RangeError(`address must be 20 bytes: ${addr}`);
  return hexToBytes(raw.padStart(64, "0"));
}

function wordUint(value: bigint): Uint8Array {
  if (value < 0n) throw new RangeError(`uint underflow: ${value}`);
  return hexToBytes(value.toString(16).padStart(64, "0"));
}

function wordUint64(value: bigint): Uint8Array {
  if (value < 0n || value > 0xffffffffffffffffn) {
    throw new RangeError(`uint64 out of range: ${value}`);
  }
  return wordUint(value);
}

function wordBytes32(hex: string): Uint8Array {
  const raw = hex.toLowerCase().replace(/^0x/, "");
  if (raw.length !== 64) throw new RangeError(`bytes32 must be 32 bytes: ${hex}`);
  return hexToBytes(raw);
}

function encodeLockParams(p: LockParams): Uint8Array {
  return new Uint8Array([
    ...wordAddress(p.token),
    ...wordUint(p.amount),
    ...wordBytes32(p.hashlock),
    ...wordUint64(p.refundAfter),
    ...wordAddress(p.refundTo),
    ...wordAddress(p.claimTo),
  ]);
}

export function encodeDepositCalldata(params: LockParams): string {
  const head = encodeLockParams(params);
  return `0x${DEPOSIT_SELECTOR}${bytesToHex(head)}`;
}

export function encodeClaimCalldata(lockId: bigint, preimage: string): string {
  if (lockId <= 0n) throw new RangeError(`lockId must be positive: ${lockId}`);
  const pre = wordBytes32(preimage);
  return `0x${CLAIM_SELECTOR}${bytesToHex(wordUint(lockId))}${bytesToHex(pre)}`;
}

export function encodeRefundCalldata(lockId: bigint): string {
  if (lockId <= 0n) throw new RangeError(`lockId must be positive: ${lockId}`);
  return `0x${REFUND_SELECTOR}${bytesToHex(wordUint(lockId))}`;
}

export function encodePauseCalldata(): string {
  return `0x${PAUSE_SELECTOR}`;
}

export function encodeUnpauseCalldata(): string {
  return `0x${UNPAUSE_SELECTOR}`;
}
