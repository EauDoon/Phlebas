export const LANDING_JOURNEY_IDS = ["trader", "quotes", "settlement"] as const;

export type LandingJourneyId = (typeof LANDING_JOURNEY_IDS)[number];

export const LANDING_JOURNEYS = [
  {
    id: "trader",
    tab: "Trade",
    title: "Trade",
    description: "Open the ZEC/USDC and ZEC/USDT book. Orders stay unsigned while wallets are off.",
    href: "/trade?view=trade",
    action: "Open terminal",
  },
  {
    id: "quotes",
    tab: "Provide quotes",
    title: "Provide quotes",
    description: "Solvers keep inventory in their own wallets. There is no shared LP token and no platform balance.",
    href: "/liquidity",
    action: "Open quotes",
  },
  {
    id: "settlement",
    tab: "Read settlement",
    title: "Read settlement",
    description: "Follow a fill from signed order through ZEC lock, stablecoin lock, and mutually exclusive claim or refund.",
    href: "/trade?view=settlement",
    action: "How settlement works",
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
