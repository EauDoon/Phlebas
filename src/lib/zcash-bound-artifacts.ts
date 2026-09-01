import { hexToBytes } from "./keccak.ts";
import type { SwapTermsV1 } from "./swap-domain.ts";
import { canonicalArtifactJson, verifyZcashArtifact, type CommittedZcashArtifact } from "./zcash-artifact.ts";
import { buildFundingArtifact, type FundingArtifactRequest } from "./zcash-funding.ts";
import { htlcP2shScriptPubKey, validateHtlcRedeemScript } from "./zcash-htlc.ts";
import {
  commitZcashSettlementArtifactBinding,
  verifyZcashSettlementArtifactBinding,
  type CommittedZcashSettlementArtifactBinding,
} from "./zcash-settlement-binding.ts";
import { projectZcashSwapTerms, type ZcashSwapProjectionV1 } from "./zcash-swap-projection.ts";
import {
  assertSwapStateIntegrity,
  fundingFactId,
  type FundingFact,
  type SwapState,
} from "./swap-state.ts";
import {
  buildClaimArtifact,
  buildRefundArtifact,
  type ClaimArtifactRequest,
  type RefundArtifactRequest,
} from "./zcash-spend.ts";
import { appendSwapEvent, type SwapJournal } from "./swap-journal.ts";

export type TermsBoundZcashArtifact = Readonly<{
  projection: ZcashSwapProjectionV1;
  artifact: CommittedZcashArtifact;
  binding: CommittedZcashSettlementArtifactBinding;
}>;

export type TermsBoundFundingArtifactRequest = Readonly<
  Omit<FundingArtifactRequest,
    "redeemScript" | "contractValueZatoshis" | "refundSafetyMargin" | "fundingTimeCutoff">
  & { terms: SwapTermsV1 }
>;

export type TermsBoundClaimArtifactRequest = Readonly<
  Omit<ClaimArtifactRequest, "contractUtxo" | "expectedHtlc" | "recipientAddress" | "recipientValueZatoshis">
  & { state: SwapState }
>;

export type TermsBoundRefundArtifactRequest = Readonly<
  Omit<RefundArtifactRequest, "contractUtxo" | "expectedHtlc" | "recipientAddress" | "recipientValueZatoshis">
  & { state: SwapState }
>;

function exactSafePositiveNumber(value: bigint, label: string): number {
  if (typeof value !== "bigint" || value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
  return Number(value);
}

function freezeBound(value: TermsBoundZcashArtifact): TermsBoundZcashArtifact {
  return Object.freeze(value);
}

function verifyBoundArtifactIdentity(
  terms: SwapTermsV1,
  bound: TermsBoundZcashArtifact,
  expectedAction?: "fund" | "claim" | "refund",
): ZcashSwapProjectionV1 {
  const expectedProjection = projectZcashSwapTerms(terms);
  verifyZcashArtifact(bound.artifact);
  verifyZcashSettlementArtifactBinding(bound.binding);
  if (canonicalArtifactJson(bound.projection as never) !== canonicalArtifactJson(expectedProjection as never)) {
    throw new Error("Terms-bound Zcash projection does not match the authoritative swap terms");
  }
  const binding = bound.binding.binding;
  if (binding.swapId !== expectedProjection.swapId
    || binding.termsHash !== expectedProjection.termsHash
    || binding.action !== bound.artifact.manifest.kind
    || binding.artifactManifestDigest !== bound.artifact.manifestDigest) {
    throw new Error("Terms-bound Zcash artifact, binding, and projection are inconsistent");
  }
  if (expectedAction !== undefined && binding.action !== expectedAction) {
    throw new Error(`Terms-bound Zcash artifact must be a ${expectedAction} action`);
  }
  return expectedProjection;
}

export function buildTermsBoundZcashFundingArtifact(
  request: TermsBoundFundingArtifactRequest,
): TermsBoundZcashArtifact {
  const { terms, ...publicEvidence } = request;
  const projection = projectZcashSwapTerms(terms);
  if (request.profile.network !== "mainnet" || request.profile.coinType !== 133) {
    throw new Error("Terms-bound Zcash funding requires the exact Mainnet encoding profile");
  }
  const fundingCutoff = exactSafePositiveNumber(BigInt(projection.fundingCutoffSeconds), "Zcash funding cutoff");
  const refundTime = exactSafePositiveNumber(BigInt(projection.refundTimeSeconds), "Zcash refund time");
  const safetyMargin = refundTime - fundingCutoff;
  if (safetyMargin <= 0) throw new RangeError("Zcash refund time must follow the signed funding cutoff");

  const artifact = buildFundingArtifact({
    ...publicEvidence,
    redeemScript: hexToBytes(projection.redeemScriptHex),
    contractValueZatoshis: BigInt(projection.amountZatoshis),
    refundSafetyMargin: { type: "timestamp", value: safetyMargin },
    fundingTimeCutoff: fundingCutoff,
  });
  verifyZcashArtifact(artifact);
  if (artifact.manifest.kind !== "fund" || artifact.manifest.network !== "mainnet") {
    throw new Error("Terms-bound Zcash funding artifact is not a Mainnet funding manifest");
  }
  if (artifact.manifest.outputs[0]?.role !== "contract"
    || artifact.manifest.outputs[0].valueZatoshis !== projection.amountZatoshis
    || artifact.manifest.authorization.redeemScriptHex !== projection.redeemScriptHex.slice(2)
    || artifact.manifest.authorization.fundingLockCutoff !== fundingCutoff
    || artifact.manifest.authorization.refundSafetyMargin?.type !== "timestamp"
    || artifact.manifest.authorization.refundSafetyMargin.value !== safetyMargin) {
    throw new Error("Terms-bound Zcash funding artifact does not match the signed settlement projection");
  }
  const binding = commitZcashSettlementArtifactBinding({
    projection,
    action: "fund",
    artifactManifestDigest: artifact.manifestDigest,
  });
  return freezeBound({ projection, artifact, binding });
}

function exactConfirmedFunding(state: SwapState, projection: ZcashSwapProjectionV1): FundingFact {
  assertSwapStateIntegrity(state);
  if (state.zec.phase !== "funded-confirmed" || !state.zec.funding || !state.zec.fundingConfirmedAtSeconds) {
    throw new Error("Terms-bound Zcash spend requires confirmed canonical ZEC funding");
  }
  const fact = state.zec.funding;
  const { factId, ...unsigned } = fact;
  if (fundingFactId(unsigned) !== factId) throw new Error("Confirmed Zcash funding fact ID does not match its contents");
  if (!fact.successful
    || fact.leg !== "zec"
    || fact.swapId !== projection.swapId
    || fact.termsHash !== projection.termsHash
    || fact.chain !== projection.chain
    || fact.asset !== projection.asset
    || fact.amountAtoms.toString() !== projection.amountZatoshis
    || fact.lockIdentity !== projection.lockScriptHash
    || fact.escrowRecordId !== projection.swapId
    || fact.funder !== state.terms.zecSellerId
    || fact.claimRecipient !== projection.claimPubKeyHash
    || fact.refundRecipient !== projection.refundPubKeyHash
    || fact.secretHash !== projection.secretHash
    || fact.refundTime.toString() !== projection.refundTimeSeconds) {
    throw new Error("Confirmed Zcash funding fact does not match the signed settlement projection");
  }
  return fact;
}

function contractOutputIndex(value: bigint): number {
  if (typeof value !== "bigint" || value < 0n || value > 0xffff_ffffn) {
    throw new RangeError("Confirmed Zcash contract output index must fit uint32");
  }
  return Number(value);
}

function spendArtifactContext(state: SwapState, feeZatoshis: bigint) {
  const projection = projectZcashSwapTerms(state.terms);
  const funding = exactConfirmedFunding(state, projection);
  if (typeof feeZatoshis !== "bigint" || feeZatoshis <= 0n || feeZatoshis >= funding.amountAtoms) {
    throw new RangeError("Zcash spend fee must leave a positive exact recipient amount");
  }
  const redeemScript = hexToBytes(projection.redeemScriptHex);
  return {
    projection,
    funding,
    redeemScript,
    expectedHtlc: validateHtlcRedeemScript(redeemScript),
    contractUtxo: {
      txid: funding.transactionId.slice(2),
      outputIndex: contractOutputIndex(funding.outputIndex),
      valueZatoshis: funding.amountAtoms,
      scriptPubKey: htlcP2shScriptPubKey(redeemScript),
      redeemScript,
    },
    recipientValueZatoshis: funding.amountAtoms - feeZatoshis,
  } as const;
}

export function buildTermsBoundZcashClaimArtifact(
  request: TermsBoundClaimArtifactRequest,
): TermsBoundZcashArtifact {
  const { state, ...publicEvidence } = request;
  if (request.profile.network !== "mainnet" || request.profile.coinType !== 133) {
    throw new Error("Terms-bound Zcash claim requires the exact Mainnet encoding profile");
  }
  const context = spendArtifactContext(state, request.feeZatoshis);
  const artifact = buildClaimArtifact({
    ...publicEvidence,
    contractUtxo: context.contractUtxo,
    expectedHtlc: context.expectedHtlc,
    recipientAddress: context.projection.claimAddress,
    recipientValueZatoshis: context.recipientValueZatoshis,
  });
  verifyZcashArtifact(artifact);
  const binding = commitZcashSettlementArtifactBinding({
    projection: context.projection,
    action: "claim",
    artifactManifestDigest: artifact.manifestDigest,
  });
  return freezeBound({ projection: context.projection, artifact, binding });
}

export function buildTermsBoundZcashRefundArtifact(
  request: TermsBoundRefundArtifactRequest,
): TermsBoundZcashArtifact {
  const { state, ...publicEvidence } = request;
  if (request.profile.network !== "mainnet" || request.profile.coinType !== 133) {
    throw new Error("Terms-bound Zcash refund requires the exact Mainnet encoding profile");
  }
  const context = spendArtifactContext(state, request.feeZatoshis);
  const artifact = buildRefundArtifact({
    ...publicEvidence,
    contractUtxo: context.contractUtxo,
    expectedHtlc: context.expectedHtlc,
    recipientAddress: context.projection.refundAddress,
    recipientValueZatoshis: context.recipientValueZatoshis,
  });
  verifyZcashArtifact(artifact);
  const binding = commitZcashSettlementArtifactBinding({
    projection: context.projection,
    action: "refund",
    artifactManifestDigest: artifact.manifestDigest,
  });
  return freezeBound({ projection: context.projection, artifact, binding });
}

export function appendTermsBoundZcashFunding(
  journal: SwapJournal,
  state: SwapState,
  bound: TermsBoundZcashArtifact,
  occurredAtSeconds: bigint,
) {
  const projection = verifyBoundArtifactIdentity(state.terms, bound, "fund");
  const manifest = bound.artifact.manifest;
  if (manifest.network !== "mainnet"
    || manifest.outputs[0]?.role !== "contract"
    || manifest.outputs[0].valueZatoshis !== projection.amountZatoshis
    || manifest.authorization.redeemScriptHex !== projection.redeemScriptHex.slice(2)
    || manifest.authorization.fundingLockCutoff?.toString() !== projection.fundingCutoffSeconds) {
    throw new Error("Terms-bound Zcash funding manifest does not match its authoritative swap terms");
  }
  return appendSwapEvent(journal, state, {
    kind: "prepare-funding",
    leg: "zec",
    artifactHash: bound.binding.bindingDigest,
    occurredAtSeconds,
  });
}
