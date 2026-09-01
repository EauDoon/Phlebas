export const LANDING_JOURNEY_IDS = ["trader", "lp", "deposit", "withdrawal"] as const;

export type LandingJourneyId = (typeof LANDING_JOURNEY_IDS)[number];

export const LANDING_JOURNEYS = [
  {
    id: "trader",
    tab: "Trader",
    title: "Signed limits, visible bounds",
    description: "Preview ZEC spot order entry and settlement disclosures.",
    href: "/trade?view=trade",
    action: "Preview trading",
  },
  {
    id: "lp",
    tab: "LP",
    title: "Legacy pool math, clearly bounded",
    description: "Inspect the superseded fixed-pair AMM simulation. Native cross-chain liquidity uses wallet-held solvers instead.",
    href: "/liquidity",
    action: "Preview liquidity",
  },
  {
    id: "deposit",
    tab: "Deposit",
    title: "Legacy custody path",
    description: "Inspect the historical transparent-ZEC gateway tour. It is not the native atomic-settlement path.",
    href: "/trade?view=bridge",
    action: "Preview deposit states",
  },
  {
    id: "withdrawal",
    tab: "Withdrawal",
    title: "Legacy payout recovery",
    description: "Inspect the historical burn-and-payout fixture. The native target preserves wallet-controlled refunds instead.",
    href: "/trade?view=bridge&journey=withdrawal",
    action: "Preview withdrawal states",
  },
] as const;

export function isLandingJourneyId(value: string | undefined): value is LandingJourneyId {
  return LANDING_JOURNEY_IDS.includes(value as LandingJourneyId);
}

export function landingJourneyIndex(id: LandingJourneyId): number {
  return LANDING_JOURNEY_IDS.indexOf(id);
}

export function nextLandingJourneyId(id: LandingJourneyId, delta: number): LandingJourneyId {
  const count = LANDING_JOURNEY_IDS.length;
  const index = (landingJourneyIndex(id) + delta + count) % count;
  return LANDING_JOURNEY_IDS[index];
}

export function landingJourneyFromHash(hash: string): LandingJourneyId {
  const trimmed = hash.trim().replace(/^#/, "");
  const id = trimmed.startsWith("journey-") ? trimmed.slice("journey-".length) : trimmed;
  return isLandingJourneyId(id) ? id : "trader";
}

export function landingJourneyHash(id: LandingJourneyId): string {
  return `#journey-${id}`;
}
