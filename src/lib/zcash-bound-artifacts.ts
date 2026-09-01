import { hexToBytes } from "./keccak.ts";
import type { SwapTermsV1 } from "./swap-domain.ts";
import { verifyZcashArtifact, type CommittedZcashArtifact } from "./zcash-artifact.ts";
import { buildFundingArtifact, type FundingArtifactRequest } from "./zcash-funding.ts";
import {
  commitZcashSettlementArtifactBinding,
  type CommittedZcashSettlementArtifactBinding,
} from "./zcash-settlement-binding.ts";
import { projectZcashSwapTerms, type ZcashSwapProjectionV1 } from "./zcash-swap-projection.ts";

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

function exactSafePositiveNumber(value: bigint, label: string): number {
  if (typeof value !== "bigint" || value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
  return Number(value);
}

function freezeBound(value: TermsBoundZcashArtifact): TermsBoundZcashArtifact {
  return Object.freeze(value);
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
