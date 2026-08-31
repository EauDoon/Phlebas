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
