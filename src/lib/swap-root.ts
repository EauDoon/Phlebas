import type { Hex32 } from "./order-domain.ts";
import { sha256Hex } from "./sha256.ts";
import { encodeSwapTerms } from "./swap-domain.ts";
import { assertSwapStateIntegrity, type SwapState } from "./swap-state.ts";

function canonicalValue(value: unknown): string {
  if (typeof value === "bigint") return `{"$bigint":"${value}"}`;
  if (typeof value === "string" || typeof value === "boolean" || value === null) return JSON.stringify(value);
  if (typeof value === "number") throw new TypeError("Swap state numbers are forbidden; use bigint");
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalValue(entry)}`)
      .join(",")}}`;
  }
  throw new TypeError("Swap state contains an unsupported value");
}

export function encodeSwapState(state: SwapState): string {
  assertSwapStateIntegrity(state);
  return canonicalValue({
    swapId: state.swapId,
    termsHash: state.termsHash,
    terms: encodeSwapTerms(state.terms),
    timingPolicy: state.timingPolicy,
    authorizations: state.authorizations,
    zec: state.zec,
    evm: state.evm,
    secret: state.secret,
    secretEvidenceId: state.secretEvidenceId,
    disputes: state.disputes,
    retractedEvidenceIds: state.retractedEvidenceIds,
  });
}

export function swapStateRoot(state: SwapState): Hex32 {
  return sha256Hex(`PhlebasSwapState\nversion=2\nstate=${encodeSwapState(state)}`);
}
