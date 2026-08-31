import { inspectTransparentDestination } from "./zcash-address.ts";

export type PayoutAttestation =
  | { status: "eligible"; burnId: string; destination: string; amountZatoshis: string }
  | { status: "rejected"; burnId: string; reason: string };

export type PayoutScreen =
  | { state: "screened"; destination: string; amountZatoshis: string }
  | { state: "rejected"; reason: string };

export type PayoutLedger = Set<string>;

export function emptyPayoutLedger(): PayoutLedger {
  return new Set();
}

export function screenPayout(destination: string, amountZatoshis: bigint): PayoutScreen {
  if (amountZatoshis <= 0n) {
    return { state: "rejected", reason: "Payout amount must be positive zatoshis." };
  }
  const inspection = inspectTransparentDestination(destination);
  if (inspection.class !== "transparent-shape") {
    return { state: "rejected", reason: inspection.message };
  }
  return {
    state: "screened",
    destination: destination.trim(),
    amountZatoshis: amountZatoshis.toString(),
  };
}

export function attestPayout(
  input: { burnId: string; destination: string; amountZatoshis: bigint },
  spent: PayoutLedger,
): PayoutAttestation {
  const burnId = input.burnId.trim();
  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(burnId)) {
    return { status: "rejected", burnId, reason: "Burn id is invalid." };
  }
  const screen = screenPayout(input.destination, input.amountZatoshis);
  if (screen.state === "rejected") {
    return { status: "rejected", burnId, reason: screen.reason };
  }
  if (spent.has(burnId)) {
    return { status: "rejected", burnId, reason: "Burn already authorized a payout." };
  }
  spent.add(burnId);
  return {
    status: "eligible",
    burnId,
    destination: screen.destination,
    amountZatoshis: screen.amountZatoshis,
  };
}

export type PayoutClaimState =
  | "requested"
  | "screened"
  | "rejected"
  | "burn-submitted"
  | "closed"
  | "burn-finalized"
  | "payable"
  | "transaction_prepared"
  | "signed"
  | "broadcast"
  | "mined"
  | "confirmed"
  | "refunded"
  | "unresolved";

export type PayoutClaim = {
  burnId: string;
  destination: string;
  amountZatoshis: string;
  state: PayoutClaimState;
  reason?: string;
};

export function requestPayout(input: { burnId: string; destination: string; amountZatoshis: bigint }): PayoutClaim {
  return {
    burnId: input.burnId.trim(),
    destination: input.destination.trim(),
    amountZatoshis: input.amountZatoshis.toString(),
    state: "requested",
  };
}

export function screenPayoutClaim(claim: PayoutClaim): PayoutClaim {
  if (claim.state !== "requested") {
    return { ...claim, state: "rejected", reason: "Only a requested claim can be screened." };
  }
  const screen = screenPayout(claim.destination, BigInt(claim.amountZatoshis));
  if (screen.state === "rejected") {
    return { ...claim, state: "rejected", reason: screen.reason };
  }
  return {
    ...claim,
    destination: screen.destination,
    amountZatoshis: screen.amountZatoshis,
    state: "screened",
  };
}

export function submitPayoutBurn(claim: PayoutClaim, spent: PayoutLedger): PayoutClaim {
  if (claim.state !== "screened") {
    return { ...claim, state: "rejected", reason: "Only a screened claim can submit a burn." };
  }
  const attestation = attestPayout({
    burnId: claim.burnId,
    destination: claim.destination,
    amountZatoshis: BigInt(claim.amountZatoshis),
  }, spent);
  if (attestation.status === "rejected") {
    return { ...claim, state: "rejected", reason: attestation.reason };
  }
  return { ...claim, state: "burn-submitted" };
}

export function finalizePayoutBurn(claim: PayoutClaim): PayoutClaim {
  if (claim.state !== "burn-submitted") {
    return { ...claim, state: "rejected", reason: "Only a submitted burn can finalize." };
  }
  return { ...claim, state: "burn-finalized" };
}

export function markPayoutPayable(claim: PayoutClaim): PayoutClaim {
  if (claim.state !== "burn-finalized") {
    return { ...claim, state: "rejected", reason: "Only a finalized burn can become payable." };
  }
  return { ...claim, state: "payable" };
}

export function rejectPayoutBeforeBurn(claim: PayoutClaim): PayoutClaim {
  if (claim.state === "rejected") return claim;
  if (claim.state !== "requested" && claim.state !== "screened") {
    return { ...claim, state: "rejected", reason: "Only a requested or screened claim can be rejected before burn." };
  }
  return {
    ...claim,
    state: "rejected",
    reason: "Destination or eligibility failed before burn. Nothing was burned.",
  };
}

export function markPayoutUnresolved(claim: PayoutClaim): PayoutClaim {
  if (
    claim.state !== "payable"
    && claim.state !== "burn-submitted"
    && claim.state !== "signed"
    && claim.state !== "broadcast"
    && claim.state !== "mined"
  ) {
    return { ...claim, state: "rejected", reason: "Only a signed, broadcast, mined, payable, or burn-submitted claim can become unresolved." };
  }
  return {
    ...claim,
    state: "unresolved",
    reason: "Committed transaction is invalid, stale, conflicted, or reorganized.",
  };
}

export function closePayoutWithoutFinalizedBurn(claim: PayoutClaim): PayoutClaim {
  if (claim.state === "closed") return claim;
  if (claim.state !== "burn-submitted") {
    return { ...claim, state: "rejected", reason: "Only a submitted burn can close without a finalized burn." };
  }
  return {
    ...claim,
    state: "closed",
    reason: "Burn evidence expired or was reorganized. Closed without a finalized burn.",
  };
}

export function preparePayoutTransaction(claim: PayoutClaim): PayoutClaim {
  if (claim.state !== "payable") {
    return { ...claim, state: "rejected", reason: "Only a payable claim can be prepared." };
  }
  return { ...claim, state: "transaction_prepared" };
}

export function signPayoutClaim(claim: PayoutClaim): PayoutClaim {
  if (claim.state !== "payable" && claim.state !== "transaction_prepared") {
    return { ...claim, state: "rejected", reason: "Only a payable or prepared claim can be signed." };
  }
  return { ...claim, state: "signed" };
}

export function broadcastPayoutClaim(claim: PayoutClaim): PayoutClaim {
  if (claim.state !== "signed") {
    return { ...claim, state: "rejected", reason: "Only a signed claim can be broadcast." };
  }
  return { ...claim, state: "broadcast" };
}

export function minePayoutClaim(claim: PayoutClaim): PayoutClaim {
  if (claim.state !== "broadcast") {
    return { ...claim, state: "rejected", reason: "Only a broadcast claim can be mined." };
  }
  return { ...claim, state: "mined" };
}

export function confirmPayoutClaim(claim: PayoutClaim): PayoutClaim {
  if (claim.state !== "mined") {
    return { ...claim, state: "rejected", reason: "Only a mined claim can be confirmed." };
  }
  return { ...claim, state: "confirmed" };
}

export function observeUnresolvedTransaction(claim: PayoutClaim): PayoutClaim {
  if (claim.state !== "unresolved") {
    return { ...claim, state: "rejected", reason: "Only an unresolved claim can recover from an observed transaction." };
  }
  return {
    ...claim,
    state: "broadcast",
    reason: "Exact committed transaction observed. Claim returns to broadcast. Nothing is sent.",
  };
}

export function restoreUnresolvedInputs(claim: PayoutClaim): PayoutClaim {
  if (claim.state !== "unresolved") {
    return { ...claim, state: "rejected", reason: "Only an unresolved claim can restore verified inputs." };
  }
  return {
    ...claim,
    state: "payable",
    reason: "Verified input restoration returns the claim to payable. Nothing is sent.",
  };
}

export function refundPayoutBeforeSignature(claim: PayoutClaim): PayoutClaim {
  if (claim.state === "refunded") return claim;
  if (claim.state === "signed") {
    return { ...claim, state: "rejected", reason: "Once a native transaction is signed, the claim cannot be refunded." };
  }
  if (claim.state !== "payable" && claim.state !== "burn-finalized" && claim.state !== "transaction_prepared") {
    return { ...claim, state: "rejected", reason: "Only a burn-finalized, payable, or prepared claim can be refunded before signature." };
  }
  return {
    ...claim,
    state: "refunded",
    reason: "Unrecoverable pre-signature failure. Single-use refund cancelled the unpaid claim and restored tZEC. Nothing is sent.",
  };
}

export function payoutClaimForTourStep(stepId: string, destination: string): PayoutClaim {
  const spent = emptyPayoutLedger();
  let claim = requestPayout({ burnId: "tour-preview", destination, amountZatoshis: 1n });
  if (stepId === "requested") return claim;
  claim = screenPayoutClaim(claim);
  if (stepId === "screened" || claim.state === "rejected") return claim;
  if (stepId === "rejected") return rejectPayoutBeforeBurn(claim);
  claim = submitPayoutBurn(claim, spent);
  if (stepId === "burn submitted" || claim.state === "rejected") return claim;
  if (stepId === "expired") return closePayoutWithoutFinalizedBurn(claim);
  claim = finalizePayoutBurn(claim);
  if (stepId === "burn finalized" || claim.state === "rejected") return claim;
  claim = markPayoutPayable(claim);
  if (stepId === "refunded") return refundPayoutBeforeSignature(claim);
  if (stepId === "payable") return claim;
  claim = preparePayoutTransaction(claim);
  if (stepId === "transaction_prepared") return claim;
  claim = signPayoutClaim(claim);
  if (stepId === "signed") return claim;
  claim = broadcastPayoutClaim(claim);
  if (stepId === "broadcast") return claim;
  claim = minePayoutClaim(claim);
  if (stepId === "mined") return claim;
  if (stepId === "unresolved") return markPayoutUnresolved(claim);
  if (stepId === "unresolved-observed") {
    return observeUnresolvedTransaction(markPayoutUnresolved(claim));
  }
  if (stepId === "input-restored") {
    return restoreUnresolvedInputs(markPayoutUnresolved(claim));
  }
  return confirmPayoutClaim(claim);
}

export function payoutClaimStubCopy(claim: PayoutClaim): string {
  return `Stub claim: ${claim.state}`;
}
