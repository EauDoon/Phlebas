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
  | "payable"
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

export function markPayoutPayable(claim: PayoutClaim): PayoutClaim {
  if (claim.state !== "burn-submitted") {
    return { ...claim, state: "rejected", reason: "Only a submitted burn can become payable." };
  }
  return { ...claim, state: "payable" };
}

export function markPayoutUnresolved(claim: PayoutClaim): PayoutClaim {
  if (claim.state !== "payable" && claim.state !== "burn-submitted") {
    return { ...claim, state: "rejected", reason: "Only a burn-submitted or payable claim can become unresolved." };
  }
  return { ...claim, state: "unresolved" };
}
