import { readFileSync } from "node:fs";

import {
  ZCASH_ARTIFACT_BOUNDARY,
  ZCASH_ARTIFACT_SCHEMA,
  commitZcashArtifact,
  createArtifactConstructionPolicy,
  type ArtifactInput,
  type ArtifactOutput,
  type CommittedZcashArtifact,
  type UnsignedTransparentManifest,
} from "../../../src/lib/zcash-artifact.ts";
import { createZip317TransparentPolicy } from "../../../src/lib/zcash-fees.ts";

export type FixtureVector = Readonly<{
  name: string;
  kind: "fund" | "claim" | "refund";
  network: "mainnet" | "testnet";
  transactionVersion: 5 | 6;
  versionGroupId: string;
  consensusBranchId: string;
  targetHeight: number;
  expiryHeight: number;
  lockTime: number;
  feeZatoshis: string;
  inputs: readonly ArtifactInput[];
  outputs: readonly ArtifactOutput[];
  inputIndex: number;
  expectedSighash: `0x${string}`;
}>;

type FixtureDocument = Readonly<{
  provenance: Readonly<{ algorithm: string; source: string; officialGenerator: string }>;
  vectors: readonly FixtureVector[];
}>;

export const fixtureDocument = JSON.parse(
  readFileSync(new URL("./zip244-v5-vectors.json", import.meta.url), "utf8"),
) as FixtureDocument;

// This is the HTLC redeem script whose P2SH scriptPubKey is present in the
// vectors.  It is deliberately kept separate: ZIP 244 hashes scriptPubKey,
// never the redeemScript supplied to a P2SH signer.
export const REDEEM_SCRIPT_HEX =
  "6382012088a82066687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f29258876a91411111111111111111111111111111111111111116703e09c41b17576a91422222222222222222222222222222222222222226888ac";
const PREIMAGE_HEX = "00".repeat(32);

export function artifactFor(vector: FixtureVector): CommittedZcashArtifact {
  const feePolicy = createZip317TransparentPolicy({
    maximumFeeZatoshis: 50_000n,
    minimumOutputZatoshis: 10_000n,
    maximumSerializedTransactionBytes: 10_000,
  });
  const fee = BigInt(vector.feeZatoshis);
  const policy = createArtifactConstructionPolicy({
    feePolicy,
    finalizedSize: {
      inputBytes: 150 * vector.inputs.length,
      outputBytes: 34 * vector.outputs.length,
    },
    feeZatoshis: fee,
    ...(vector.kind === "fund" ? {} : { observedHeight: vector.targetHeight }),
    ...(vector.kind === "refund"
      ? {
        refundMaturity: {
          lockType: "height" as const,
          currentBlockHeight: vector.targetHeight,
          medianTimePast: null,
        },
      }
      : {}),
  });
  const authorization: UnsignedTransparentManifest["authorization"] = vector.kind === "fund"
    ? {
      sighashType: "SIGHASH_ALL",
      sighashCode: 1,
      txModifiable: 0,
      branch: "fund",
      redeemScriptHex: REDEEM_SCRIPT_HEX,
      refundSafetyMargin: { type: "height", value: 10 },
      fundingLockCutoff: vector.targetHeight,
    }
    : vector.kind === "claim"
      ? {
        sighashType: "SIGHASH_ALL",
        sighashCode: 1,
        txModifiable: 0,
        branch: "claim",
        redeemScriptHex: REDEEM_SCRIPT_HEX,
        preimageHex: PREIMAGE_HEX,
      }
      : {
        sighashType: "SIGHASH_ALL",
        sighashCode: 1,
        txModifiable: 0,
        branch: "refund",
        redeemScriptHex: REDEEM_SCRIPT_HEX,
      };

  return commitZcashArtifact({
    schema: ZCASH_ARTIFACT_SCHEMA,
    boundary: ZCASH_ARTIFACT_BOUNDARY,
    kind: vector.kind,
    network: vector.network,
    profile: {
      id: `zcash-${vector.network}-nu6.3-v${vector.transactionVersion}`,
      transactionVersion: vector.transactionVersion,
      versionGroupId: vector.versionGroupId,
      consensusBranchId: vector.consensusBranchId,
      coinType: vector.network === "mainnet" ? 133 : 1,
    },
    targetHeight: vector.targetHeight,
    expiryHeight: vector.expiryHeight,
    lockTime: vector.lockTime,
    inputs: vector.inputs,
    outputs: vector.outputs,
    feeZatoshis: vector.feeZatoshis,
    policy,
    authorization,
    transactionIdState: "unresolved-until-canonical-transaction-extraction",
  });
}

export function vector(name: string): FixtureVector {
  const found = fixtureDocument.vectors.find((entry) => entry.name === name);
  if (!found) throw new Error(`Missing ZIP 244 fixture ${name}`);
  return found;
}
