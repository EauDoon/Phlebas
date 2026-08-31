export const GATEWAY_JOURNEYS = ["deposit", "withdrawal"] as const;

export type GatewayJourney = (typeof GATEWAY_JOURNEYS)[number];

export const GATEWAY_JOURNEY_LABELS: Record<GatewayJourney, string> = {
  deposit: "Deposit preview",
  withdrawal: "Withdrawal states",
};

export function isGatewayJourney(value: string | undefined): value is GatewayJourney {
  return GATEWAY_JOURNEYS.includes(value as GatewayJourney);
}

export function nextGatewayJourney(id: GatewayJourney, delta: number): GatewayJourney {
  const count = GATEWAY_JOURNEYS.length;
  const index = (GATEWAY_JOURNEYS.indexOf(id) + delta + count) % count;
  return GATEWAY_JOURNEYS[index];
}
