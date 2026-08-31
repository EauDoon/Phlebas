import { TESTNET_MIN_CONFIRMATIONS, outpointKey, type ObservedOutpoint } from "./observer.ts";
import { isTestnetTex } from "./tex.ts";

export type MintAttestation =
  | { status: "eligible"; outpointKey: string; amountZatoshis: string; tex: string }
  | { status: "provisional"; outpointKey: string; reason: string }
  | { status: "quarantined"; outpointKey: string; reason: string }
  | { status: "rejected"; outpointKey: string; reason: string };

export type MintLedger = Set<string>;

export function emptyMintLedger(): MintLedger {
  return new Set();
}

export function attestMint(observation: ObservedOutpoint, spent: MintLedger): MintAttestation {
  const key = outpointKey(observation.txid, observation.vout);
  if (observation.network !== "testnet" || !isTestnetTex(observation.tex)) {
    return { status: "rejected", outpointKey: key, reason: "Mint attestation is textest-only." };
  }
  if (spent.has(key)) {
    return { status: "rejected", outpointKey: key, reason: "Outpoint already authorized a mint." };
  }
  if (observation.shieldedBundle || !observation.transparentInputsOnly || !observation.transparentOutputsOnly) {
    return { status: "quarantined", outpointKey: key, reason: "Final transaction is not fully transparent." };
  }
  if (observation.confirmations < TESTNET_MIN_CONFIRMATIONS) {
    return { status: "provisional", outpointKey: key, reason: `Need ${TESTNET_MIN_CONFIRMATIONS} confirmations. Zero-confirmation credit is never allowed.` };
  }
  spent.add(key);
  return {
    status: "eligible",
    outpointKey: key,
    amountZatoshis: observation.amountZatoshis.toString(),
    tex: observation.tex,
  };
}
