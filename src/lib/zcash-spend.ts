import { createHash } from "node:crypto";

import { bytesToHex } from "./keccak.ts";
import {
  ZCASH_ARTIFACT_BOUNDARY,
  ZCASH_ARTIFACT_SCHEMA,
  commitZcashArtifact,
  createArtifactConstructionPolicy,
  type CommittedZcashArtifact,
} from "./zcash-artifact.ts";
import {
  validateTransparentFee,
  type FinalizedTransparentSize,
  type TransparentFeePolicy,
} from "./zcash-fees.ts";
import {
  evaluateHtlcCltv,
  htlcP2shScriptPubKey,
  htlcTemplatePolicyReport,
  validateHtlcRedeemScript,
  type HtlcMaturityContext,
  type HtlcParameters,
} from "./zcash-htlc.ts";
import {
  FINAL_SEQUENCE,
  LOCKTIME_ENABLED_SEQUENCE,
  evaluateExpiry,
  validateExpiryHeight,
  validateTargetHeight,
  type Nu63EncodingProfile,
} from "./zcash-transaction-policy.ts";
import { decodeTransparentAddress, transparentScriptPubKey } from "./zcash-transparent.ts";

export type HtlcContractUtxo = Readonly<{
  txid: string;
  outputIndex: number;
  valueZatoshis: bigint;
  scriptPubKey: Uint8Array;
  redeemScript: Uint8Array;
}>;

type SpendArtifactRequest = Readonly<{
  profile: Nu63EncodingProfile;
  targetHeight: number;
  expiryHeight: number;
  observedHeight: number;
  contractUtxo: HtlcContractUtxo;
  expectedHtlc: HtlcParameters;
  recipientAddress: string;
  recipientValueZatoshis: bigint;
  feeZatoshis: bigint;
  feePolicy: TransparentFeePolicy;
  finalizedSize: FinalizedTransparentSize;
}>;

export type ClaimArtifactRequest = SpendArtifactRequest & Readonly<{
  preimage: Uint8Array;
}>;

export type RefundArtifactRequest = SpendArtifactRequest & Readonly<{
  maturity: HtlcMaturityContext;
}>;

function exactTxid(txid: string): string {
  if (!/^[0-9a-f]{64}$/.test(txid)) throw new TypeError("Contract outpoint transaction ID must be 32 lowercase hexadecimal bytes");
  return txid;
}

function uint32(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new RangeError(`${label} must be an unsigned 32-bit integer`);
  }
  return value;
}

function zatoshis(value: bigint, label: string): bigint {
  if (typeof value !== "bigint" || value <= 0n) throw new RangeError(`${label} must be positive zatoshis`);
  return value;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function uint32Hex(value: number): string {
  return uint32(value, "Profile identifier").toString(16).padStart(8, "0");
}

function prepareSpend(
  request: SpendArtifactRequest,
  kind: "claim" | "refund",
): Readonly<{
  targetHeight: number;
  expiryHeight: number;
  htlc: HtlcParameters;
  input: {
    txid: string;
    outputIndex: number;
    sequence: number;
    valueZatoshis: string;
    scriptPubKeyHex: string;
  };
  output: {
    role: "recipient";
    valueZatoshis: string;
    scriptPubKeyHex: string;
  };
}> {
  const targetHeight = validateTargetHeight(request.profile, request.targetHeight);
  const expiryHeight = validateExpiryHeight(request.profile, targetHeight, request.expiryHeight);
  const observedHeight = validateTargetHeight(request.profile, request.observedHeight);
  const expiry = evaluateExpiry(expiryHeight, observedHeight);
  if (expiry.state === "expired") throw new Error("Spend artifact is expired and must be rebuilt");
  if (expiry.state === "unresolved") throw new Error("Spend artifact expiry is unresolved");
  const htlc = validateHtlcRedeemScript(request.contractUtxo.redeemScript, request.expectedHtlc);
  const templatePolicy = htlcTemplatePolicyReport(request.contractUtxo.redeemScript);
  if (!templatePolicy.templatePolicyPasses) {
    throw new TypeError(`HTLC redeemScript failed template policy: ${templatePolicy.reasons.join("; ")}`);
  }
  const expectedContractScript = htlcP2shScriptPubKey(request.contractUtxo.redeemScript);
  if (!sameBytes(request.contractUtxo.scriptPubKey, expectedContractScript)) {
    throw new Error("Contract UTXO scriptPubKey does not match the exact HTLC redeemScript hash");
  }

  const decodedRecipient = decodeTransparentAddress(request.recipientAddress);
  if (decodedRecipient.network !== request.profile.network) throw new Error("Spend recipient is for the wrong Zcash network");
  if (decodedRecipient.type !== "p2pkh") throw new TypeError("Spend recipient must be transparent P2PKH");
  const expectedRecipientHash = kind === "claim" ? htlc.claimPkh : htlc.refundPkh;
  if (!sameBytes(decodedRecipient.hash, expectedRecipientHash)) {
    throw new Error(`${kind} recipient does not match the public-key hash committed by the HTLC`);
  }

  const inputValue = zatoshis(request.contractUtxo.valueZatoshis, "Contract UTXO value");
  const recipientValue = zatoshis(request.recipientValueZatoshis, "Spend recipient value");
  const fee = zatoshis(request.feeZatoshis, "Spend fee");
  if (recipientValue < request.feePolicy.minimumOutputZatoshis) {
    throw new RangeError("Spend recipient value is below the configured minimum output");
  }
  if (recipientValue + fee !== inputValue) {
    throw new RangeError("Contract UTXO value must equal the fixed recipient value plus fee; spend change is not permitted");
  }
  validateTransparentFee(request.feePolicy, request.finalizedSize, fee);

  return {
    targetHeight,
    expiryHeight,
    htlc,
    input: {
      txid: exactTxid(request.contractUtxo.txid),
      outputIndex: uint32(request.contractUtxo.outputIndex, "Contract outpoint index"),
      sequence: kind === "claim" ? FINAL_SEQUENCE : LOCKTIME_ENABLED_SEQUENCE,
      valueZatoshis: inputValue.toString(),
      scriptPubKeyHex: bytesToHex(expectedContractScript),
    },
    output: {
      role: "recipient",
      valueZatoshis: recipientValue.toString(),
      scriptPubKeyHex: bytesToHex(transparentScriptPubKey(request.recipientAddress, request.profile.network)),
    },
  } as const;
}

function commonManifest(request: SpendArtifactRequest, prepared: ReturnType<typeof prepareSpend>) {
  return {
    schema: ZCASH_ARTIFACT_SCHEMA,
    boundary: ZCASH_ARTIFACT_BOUNDARY,
    network: request.profile.network,
    profile: {
      id: request.profile.id,
      transactionVersion: request.profile.transactionVersion,
      versionGroupId: uint32Hex(request.profile.versionGroupId),
      consensusBranchId: uint32Hex(request.profile.consensusBranchId),
      coinType: request.profile.coinType,
    },
    targetHeight: prepared.targetHeight,
    expiryHeight: prepared.expiryHeight,
    inputs: [prepared.input],
    outputs: [prepared.output],
    feeZatoshis: request.feeZatoshis.toString(),
    policy: createArtifactConstructionPolicy({
      feePolicy: request.feePolicy,
      finalizedSize: request.finalizedSize,
      feeZatoshis: request.feeZatoshis,
      observedHeight: request.observedHeight,
    }),
    transactionIdState: "unresolved-until-canonical-transaction-extraction",
  } as const;
}

export function buildClaimArtifact(request: ClaimArtifactRequest): CommittedZcashArtifact {
  const prepared = prepareSpend(request, "claim");
  if (!(request.preimage instanceof Uint8Array) || request.preimage.length !== 32) {
    throw new RangeError("Claim preimage must be exactly 32 bytes");
  }
  const digest = createHash("sha256").update(request.preimage).digest();
  if (!sameBytes(digest, prepared.htlc.digest)) throw new Error("Claim preimage does not match the HTLC SHA-256 digest");

  return commitZcashArtifact({
    ...commonManifest(request, prepared),
    kind: "claim",
    lockTime: 0,
    authorization: {
      sighashType: "SIGHASH_ALL",
      sighashCode: 1,
      txModifiable: 0,
      branch: "claim",
      redeemScriptHex: bytesToHex(request.contractUtxo.redeemScript),
      preimageHex: bytesToHex(request.preimage),
    },
  });
}

export function buildRefundArtifact(request: RefundArtifactRequest): CommittedZcashArtifact {
  const prepared = prepareSpend(request, "refund");
  if (request.maturity.currentBlockHeight !== request.observedHeight) {
    throw new Error("Refund height evidence must match the observed height used for expiry evaluation");
  }
  const maturity = evaluateHtlcCltv({
    lock: prepared.htlc.lock,
    txLockTime: prepared.htlc.lock.value,
    inputSequence: LOCKTIME_ENABLED_SEQUENCE,
    ...request.maturity,
  });
  if (!maturity.mature) throw new Error(`Refund is unresolved or early: ${maturity.reason ?? "maturity was not proven"}`);

  return commitZcashArtifact({
    ...commonManifest(request, prepared),
    kind: "refund",
    lockTime: prepared.htlc.lock.value,
    policy: createArtifactConstructionPolicy({
      feePolicy: request.feePolicy,
      finalizedSize: request.finalizedSize,
      feeZatoshis: request.feeZatoshis,
      observedHeight: request.observedHeight,
      refundMaturity: {
        lockType: prepared.htlc.lock.type,
        currentBlockHeight: request.maturity.currentBlockHeight,
        medianTimePast: request.maturity.medianTimePast ?? null,
      },
    }),
    authorization: {
      sighashType: "SIGHASH_ALL",
      sighashCode: 1,
      txModifiable: 0,
      branch: "refund",
      redeemScriptHex: bytesToHex(request.contractUtxo.redeemScript),
    },
  });
}
