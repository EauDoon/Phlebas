export const GATEWAY_INCIDENTS = [
  {
    id: "country-blocked",
    title: "Historical location-block state.",
    body: "This copy-only fixture illustrates how a removed custody flow would have stopped. No account, trade, deposit, or withdrawal is available here.",
  },
  {
    id: "eligibility-review",
    title: "Historical review state.",
    body: "This copy-only fixture illustrates a former review hold. No asset action can start or continue in this application.",
  },
  {
    id: "deposit-review",
    title: "Historical deposit-review state.",
    body: "This copy-only fixture preserves a former unapproved-observation state. No receiver, deposit intent, or minting path exists in this application.",
  },
  {
    id: "withdrawal-review-before-burn",
    title: "Historical pre-payout review state.",
    body: "This copy-only fixture preserves a former review before an external payout. No burn, payout request, or production gateway exists here.",
  },
  {
    id: "withdrawal-review-after-burn",
    title: "Historical post-burn review state.",
    body: "This copy-only fixture preserves a former pending-claim record. It has no payout authority and no customer claim is recorded by this application.",
  },
  {
    id: "observer-disagreement",
    title: "Historical observer-disagreement state.",
    body: "This copy-only fixture preserves the evidence that would have blocked a former mint decision. The retained atomic-swap observer is read-only and cannot move value.",
  },
  {
    id: "reorg-before-mint",
    title: "Historical confirmation-change state.",
    body: "This copy-only fixture preserves a former chain-reorganization example. It cannot generate a receiver, credit a deposit, or mint any token.",
  },
  {
    id: "reorg-after-mint",
    title: "Historical reconciliation state.",
    body: "This copy-only fixture preserves a former reconciliation example after a chain reorganization. There are no reserves, liabilities, mints, or native ZEC withdrawals in this application.",
  },
  {
    id: "planned-maintenance",
    title: "Historical maintenance state.",
    body: "This copy-only fixture shows a former maintenance notice. The time window is illustrative, and this application has no deposit intents or withdrawal requests.",
  },
  {
    id: "unplanned-maintenance",
    title: "Historical service-unavailable state.",
    body: "This copy-only fixture shows a former unavailable-service message. It does not infer any order, balance, deposit, or withdrawal claim.",
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
