import { decodeTex, isTestnetTex } from "./tex.ts";

export const TESTNET_MIN_CONFIRMATIONS = 10;

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
  if (!TXID.test(txid) || !Number.isInteger(vout) || vout < 0) {
    throw new RangeError("Outpoint must be a 32-byte txid and a non-negative vout");
  }
  return `${txid}:${vout}`;
}

export function confirmationsAtTip(blockHeight: number, tipHeight: number): number {
  if (!Number.isInteger(blockHeight) || !Number.isInteger(tipHeight) || blockHeight < 0 || tipHeight < 0) {
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
  transparentInputsOnly?: boolean;
  transparentOutputsOnly?: boolean;
  shieldedBundle?: boolean;
}): ObservedOutpoint {
  const txid = input.txid.toLowerCase();
  outpointKey(txid, input.vout);
  if (!BLOCK_HASH.test(input.blockHash)) {
    throw new TypeError("Block hash must be 32-byte hex");
  }
  if (input.amountZatoshis <= 0n) {
    throw new RangeError("Observed amount must be positive zatoshis");
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
    blockHash: input.blockHash.toLowerCase(),
    confirmations: confirmationsAtTip(input.blockHeight, input.tipHeight),
    transparentInputsOnly: input.transparentInputsOnly ?? true,
    transparentOutputsOnly: input.transparentOutputsOnly ?? true,
    shieldedBundle: input.shieldedBundle ?? false,
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
      || other.blockHash !== first.blockHash
      || other.blockHeight !== first.blockHeight
    ) {
      throw new Error("Observer disagreement; minting is stopped");
    }
  }
  return first;
}

export function applyReorg(observation: ObservedOutpoint, stillOnChain: boolean): "drop" | "keep" {
  if (!stillOnChain) return "drop";
  if (observation.confirmations < TESTNET_MIN_CONFIRMATIONS) return "drop";
  return "keep";
}
