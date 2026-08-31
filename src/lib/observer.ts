import { decodeTex, isTestnetTex } from "./tex.ts";

export const TESTNET_MIN_CONFIRMATIONS = 10;
export const MAX_ZATOSHIS = 21_000_000n * 100_000_000n;

export type ObservedOutpoint = {
  network: "testnet";
  txid: string;
  vout: number;
  amountZatoshis: bigint;
  tex: string;
  p2pkhHashHex: string;
  blockHeight: number;
  blockHash: string;
  confirmations: number;
  transparentInputsOnly: boolean;
  transparentOutputsOnly: boolean;
  shieldedBundle: boolean;
};

const TXID = /^[0-9a-f]{64}$/;
const BLOCK_HASH = /^[0-9a-f]{64}$/;

export function outpointKey(txid: string, vout: number): string {
  if (!TXID.test(txid) || !Number.isSafeInteger(vout) || vout < 0 || vout > 0xffff_ffff) {
    throw new RangeError("Outpoint must be a 32-byte txid and a non-negative vout");
  }
  return `${txid}:${vout}`;
}

export function confirmationsAtTip(blockHeight: number, tipHeight: number): number {
  if (!Number.isSafeInteger(blockHeight) || !Number.isSafeInteger(tipHeight) || blockHeight < 0 || tipHeight < 0) {
    throw new RangeError("Heights must be non-negative integers");
  }
  if (tipHeight < blockHeight) return 0;
  return tipHeight - blockHeight + 1;
}

export function parseStubObservation(input: {
  txid: string;
  vout: number;
  amountZatoshis: bigint;
  tex: string;
  blockHeight: number;
  blockHash: string;
  tipHeight: number;
  transparentInputsOnly: boolean;
  transparentOutputsOnly: boolean;
  shieldedBundle: boolean;
}): ObservedOutpoint {
  const txid = input.txid.toLowerCase();
  const blockHash = input.blockHash.toLowerCase();
  outpointKey(txid, input.vout);
  if (!BLOCK_HASH.test(blockHash)) {
    throw new TypeError("Block hash must be 32-byte hex");
  }
  if (input.amountZatoshis <= 0n || input.amountZatoshis > MAX_ZATOSHIS) {
    throw new RangeError("Observed amount must be within the Zcash supply cap");
  }
  if (!isTestnetTex(input.tex)) {
    throw new TypeError("Observer stub accepts textest destinations only");
  }
  const decoded = decodeTex(input.tex);
  if (decoded.network !== "testnet") {
    throw new TypeError("Observer stub rejects mainnet TEX");
  }
  return {
    network: "testnet",
    txid,
    vout: input.vout,
    amountZatoshis: input.amountZatoshis,
    tex: input.tex,
    p2pkhHashHex: [...decoded.payload].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
    blockHeight: input.blockHeight,
    blockHash,
    confirmations: confirmationsAtTip(input.blockHeight, input.tipHeight),
    transparentInputsOnly: input.transparentInputsOnly,
    transparentOutputsOnly: input.transparentOutputsOnly,
    shieldedBundle: input.shieldedBundle,
  };
}

export function agreeObservations(observations: ObservedOutpoint[]): ObservedOutpoint {
  if (observations.length === 0) {
    throw new Error("Observer set is empty");
  }
  const [first, ...rest] = observations;
  for (const other of rest) {
    if (
      other.txid !== first.txid
      || other.vout !== first.vout
      || other.amountZatoshis !== first.amountZatoshis
      || other.tex !== first.tex
      || other.p2pkhHashHex !== first.p2pkhHashHex
      || other.blockHash !== first.blockHash
      || other.blockHeight !== first.blockHeight
      || other.transparentInputsOnly !== first.transparentInputsOnly
      || other.transparentOutputsOnly !== first.transparentOutputsOnly
      || other.shieldedBundle !== first.shieldedBundle
    ) {
      throw new Error("Observer disagreement; minting is stopped");
    }
  }
  return { ...first, confirmations: Math.min(...observations.map((observation) => observation.confirmations)) };
}

export function applyReorg(observation: ObservedOutpoint, stillOnChain: boolean): "drop" | "keep" {
  if (!stillOnChain) return "drop";
  if (observation.confirmations < TESTNET_MIN_CONFIRMATIONS) return "drop";
  return "keep";
}
