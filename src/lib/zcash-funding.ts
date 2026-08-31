import { bytesToHex } from "./keccak.ts";
import {
  ZCASH_ARTIFACT_BOUNDARY,
  ZCASH_ARTIFACT_SCHEMA,
  commitZcashArtifact,
  type ArtifactOutput,
  type CommittedZcashArtifact,
} from "./zcash-artifact.ts";
import {
  planTransparentChange,
  type FinalizedTransparentSize,
  type TransparentFeePolicy,
} from "./zcash-fees.ts";
import { htlcP2shScriptPubKey, htlcTemplatePolicyReport, validateHtlcRedeemScript } from "./zcash-htlc.ts";
import {
  FINAL_SEQUENCE,
  validateExpiryHeight,
  validateTargetHeight,
  type Nu63EncodingProfile,
} from "./zcash-transaction-policy.ts";
import {
  decodeTransparentAddress,
  transparentScriptPubKey,
  type ZcashNetwork,
} from "./zcash-transparent.ts";

export type FundingUtxo = Readonly<{
  txid: string;
  outputIndex: number;
  valueZatoshis: bigint;
  address: string;
  scriptPubKey: Uint8Array;
}>;

export type FundingArtifactRequest = Readonly<{
  profile: Nu63EncodingProfile;
  targetHeight: number;
  expiryHeight: number;
  inputs: readonly FundingUtxo[];
  redeemScript: Uint8Array;
  contractValueZatoshis: bigint;
  changeAddress?: string;
  feeZatoshis: bigint;
  feePolicy: TransparentFeePolicy;
  finalizedSizeWithoutChange: FinalizedTransparentSize;
  finalizedSizeWithChange: FinalizedTransparentSize;
  belowMinimumChange: "reject" | "add-to-fee";
  refundSafetyMargin: Readonly<{ type: "height" | "timestamp"; value: number }>;
  fundingTimeCutoff?: number;
}>;

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

function exactTxid(txid: string): string {
  if (!/^[0-9a-f]{64}$/.test(txid)) throw new TypeError("Funding outpoint transaction ID must be 32 lowercase hexadecimal bytes");
  return txid;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function exactP2pkhScript(address: string, script: Uint8Array, network: ZcashNetwork, role: string): Uint8Array {
  const decoded = decodeTransparentAddress(address);
  if (decoded.network !== network) throw new Error(`${role} address is for the wrong Zcash network`);
  if (decoded.type !== "p2pkh") throw new TypeError(`${role} address must be transparent P2PKH`);
  const expected = transparentScriptPubKey(address, network);
  if (!sameBytes(script, expected)) throw new Error(`${role} scriptPubKey does not match its address`);
  return Uint8Array.from(expected);
}

function uint32Hex(value: number): string {
  return uint32(value, "Profile identifier").toString(16).padStart(8, "0");
}

function requireFutureRefund(
  lock: Readonly<{ type: "height" | "timestamp"; value: number }>,
  request: FundingArtifactRequest,
  targetHeight: number,
): void {
  const margin = request.refundSafetyMargin;
  if (!margin || margin.type !== lock.type || !Number.isSafeInteger(margin.value) || margin.value <= 0) {
    throw new RangeError("Refund safety margin must be a positive integer in the HTLC locktime domain");
  }
  const fundingCutoff = lock.type === "height"
    ? targetHeight
    : uint32(request.fundingTimeCutoff as number, "Funding time cutoff");
  if (lock.type === "timestamp" && fundingCutoff < 500_000_000) {
    throw new RangeError("Funding time cutoff must use the timestamp locktime domain");
  }
  if (lock.value <= fundingCutoff || lock.value - fundingCutoff < margin.value) {
    throw new RangeError("HTLC refund lock does not preserve the approved future safety margin");
  }
}

export function buildFundingArtifact(request: FundingArtifactRequest): CommittedZcashArtifact {
  const targetHeight = validateTargetHeight(request.profile, request.targetHeight);
  const expiryHeight = validateExpiryHeight(request.profile, targetHeight, request.expiryHeight);
  if (request.inputs.length === 0) throw new RangeError("Funding artifact requires at least one input");

  const outpoints = new Set<string>();
  let inputTotal = 0n;
  const inputs = request.inputs.map((input) => {
    const txid = exactTxid(input.txid);
    const outputIndex = uint32(input.outputIndex, "Funding outpoint index");
    const key = `${txid}:${outputIndex}`;
    if (outpoints.has(key)) throw new Error("Funding artifact contains a duplicate outpoint");
    outpoints.add(key);
    const value = zatoshis(input.valueZatoshis, "Funding input value");
    inputTotal += value;
    const script = exactP2pkhScript(input.address, input.scriptPubKey, request.profile.network, "Funding input");
    return {
      txid,
      outputIndex,
      sequence: FINAL_SEQUENCE,
      valueZatoshis: value.toString(),
      scriptPubKeyHex: bytesToHex(script),
    };
  });

  const htlc = validateHtlcRedeemScript(request.redeemScript);
  requireFutureRefund(htlc.lock, request, targetHeight);
  const templatePolicy = htlcTemplatePolicyReport(request.redeemScript);
  if (!templatePolicy.templatePolicyPasses) {
    throw new TypeError(`HTLC redeemScript failed template policy: ${templatePolicy.reasons.join("; ")}`);
  }
  const contractValue = zatoshis(request.contractValueZatoshis, "Contract output value");
  const contractScript = htlcP2shScriptPubKey(request.redeemScript);

  const changePlan = planTransparentChange({
    policy: request.feePolicy,
    inputTotalZatoshis: inputTotal,
    fixedOutputTotalZatoshis: contractValue,
    feeZatoshis: request.feeZatoshis,
    finalizedSizeWithoutChange: request.finalizedSizeWithoutChange,
    finalizedSizeWithChange: request.finalizedSizeWithChange,
    belowMinimum: request.belowMinimumChange,
  });

  const outputs: ArtifactOutput[] = [
    { role: "contract" as const, valueZatoshis: contractValue.toString(), scriptPubKeyHex: bytesToHex(contractScript) },
  ];
  if (changePlan.disposition === "change") {
    if (!request.changeAddress) throw new TypeError("A network-correct change address is required for non-zero change");
    const changeScript = transparentScriptPubKey(request.changeAddress, request.profile.network);
    const decodedChange = decodeTransparentAddress(request.changeAddress);
    if (decodedChange.type !== "p2pkh") throw new TypeError("Change address must be transparent P2PKH");
    outputs.push({
      role: "change",
      valueZatoshis: changePlan.changeZatoshis.toString(),
      scriptPubKeyHex: bytesToHex(changeScript),
    });
  } else if (request.changeAddress) {
    exactP2pkhScript(
      request.changeAddress,
      transparentScriptPubKey(request.changeAddress, request.profile.network),
      request.profile.network,
      "Change",
    );
  }

  return commitZcashArtifact({
    schema: ZCASH_ARTIFACT_SCHEMA,
    boundary: ZCASH_ARTIFACT_BOUNDARY,
    kind: "fund",
    network: request.profile.network,
    profile: {
      id: request.profile.id,
      transactionVersion: request.profile.transactionVersion,
      versionGroupId: uint32Hex(request.profile.versionGroupId),
      consensusBranchId: uint32Hex(request.profile.consensusBranchId),
      coinType: request.profile.coinType,
    },
    targetHeight,
    expiryHeight,
    lockTime: 0,
    inputs,
    outputs,
    feeZatoshis: changePlan.feeZatoshis.toString(),
    authorization: {
      sighashType: "SIGHASH_ALL",
      sighashCode: 1,
      txModifiable: 0,
      branch: "fund",
      redeemScriptHex: bytesToHex(request.redeemScript),
      refundSafetyMargin: request.refundSafetyMargin,
      fundingLockCutoff: htlc.lock.type === "height" ? targetHeight : request.fundingTimeCutoff,
    },
    transactionIdState: "unresolved-until-canonical-transaction-extraction",
  });
}
