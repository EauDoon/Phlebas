export const GATEWAY_INCIDENTS = [
  {
    id: "country-blocked",
    title: "Phlebas is not available in this location.",
    body: "This preview is limited to approved locations. Trading, liquidity, deposit, and withdrawal controls are unavailable.",
  },
  {
    id: "eligibility-review",
    title: "This request needs review.",
    body: "No asset action will continue while the review is open. Completion is not guaranteed.",
  },
  {
    id: "deposit-review",
    title: "Deposit credit is paused for review.",
    body: "The observed transaction has not been approved for minting. Do not send another deposit to the same intent.",
  },
  {
    id: "withdrawal-review-before-burn",
    title: "Withdrawal review is open.",
    body: "Nothing has been burned. The request can still be edited or cancelled in a production gateway.",
  },
  {
    id: "withdrawal-review-after-burn",
    title: "Payout review is open.",
    body: "Your payout claim remains recorded while processing is paused. A finalized burn is not silently discarded.",
  },
  {
    id: "reorg-before-mint",
    title: "Zcash confirmations changed.",
    body: "The deposit is provisional again because its prior block is no longer in the accepted chain. Nothing will be minted until the deposit is included and reaches the required confirmation threshold.",
  },
  {
    id: "reorg-after-mint",
    title: "Gateway incident controls are active.",
    body: "A previously credited Zcash deposit changed after a chain reorganization. New mints and native ZEC withdrawals are paused while reserves and liabilities are reconciled.",
  },
  {
    id: "planned-maintenance",
    title: "Gateway maintenance is scheduled.",
    body: "New deposit intents and withdrawal requests will be unavailable from 2026-09-01 02:00 UTC to 2026-09-01 04:00 UTC. Existing requests keep their last confirmed status.",
  },
  {
    id: "unplanned-maintenance",
    title: "This service is temporarily unavailable.",
    body: "No new action can start. Existing orders, balances, deposits, and withdrawal claims have not been inferred from this outage message.",
  },
] as const;

export type GatewayIncidentId = (typeof GATEWAY_INCIDENTS)[number]["id"];

export function gatewayIncidentById(id: string): (typeof GATEWAY_INCIDENTS)[number] | null {
  return GATEWAY_INCIDENTS.find((incident) => incident.id === id) ?? null;
}

export const INCIDENT_DEMO_QUERY = "incidents";
export const INCIDENT_DEMO_STORAGE_KEY = "phlebas.incidentDemo";

export function isIncidentDemoQuery(value: string | undefined): boolean {
  return value === INCIDENT_DEMO_QUERY;
}

const incidentDemoListeners = new Set<() => void>();

export function rememberIncidentDemo(
  fromUrl: boolean,
  storage?: Pick<Storage, "getItem" | "setItem"> | null,
): boolean {
  const session = storage === undefined
    ? (typeof window === "undefined" ? null : window.sessionStorage)
    : storage;
  try {
    if (fromUrl) {
      session?.setItem(INCIDENT_DEMO_STORAGE_KEY, INCIDENT_DEMO_QUERY);
      if (storage === undefined) {
        for (const listener of incidentDemoListeners) listener();
      }
      return true;
    }
    return session?.getItem(INCIDENT_DEMO_STORAGE_KEY) === INCIDENT_DEMO_QUERY;
  } catch {
    return fromUrl;
  }
}

export function subscribeIncidentDemo(listener: () => void): () => void {
  incidentDemoListeners.add(listener);
  return () => {
    incidentDemoListeners.delete(listener);
  };
}

export function getIncidentDemoSnapshot(): boolean {
  return rememberIncidentDemo(false);
}

export function getIncidentDemoServerSnapshot(): boolean {
  return false;
}
