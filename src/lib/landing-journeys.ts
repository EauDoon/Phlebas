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
    title: "Two pools, no incentive maze",
    description: "Inspect fixed-pair pool math and LP risks without depositing assets.",
    href: "/liquidity",
    action: "Preview liquidity",
  },
  {
    id: "deposit",
    tab: "Deposit",
    title: "The custody boundary stays visible",
    description: "See how eligible transparent native ZEC could enter a deposit tour.",
    href: "/trade?view=bridge",
    action: "Preview deposit states",
  },
  {
    id: "withdrawal",
    tab: "Withdrawal",
    title: "A burn is not a payout",
    description: "See how a burn could create a transparent native ZEC payout claim.",
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
