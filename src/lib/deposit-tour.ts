export const DEPOSIT_TOUR = [
  {
    id: "eligibility",
    title: "Eligibility",
    body: "A historical custody gateway would accept eligible transparent native ZEC. This keyless tour never requests location, identity, account information, or assets.",
  },
  {
    id: "address-request",
    title: "Address request",
    body: "No address is generated. The ZIP 320 shape is a non-payable format example, never a wallet handoff.",
  },
  {
    id: "observed",
    title: "Observed",
    body: "Independent observers would bind the outpoint, amount, destination, and tip. Zero-confirmation credit is never allowed. Nothing is observed here.",
  },
  {
    id: "unavailable",
    title: "Unavailable",
    body: "Observers unavailable or disagree. Fail closed. Nothing is minted.",
  },
  {
    id: "screening",
    title: "Screening",
    body: "Checks in progress is a production state. This demonstration does not screen funds or promise credit.",
  },
  {
    id: "rejected",
    title: "Rejected",
    body: "Deposit failed screening or is ineligible. Nothing was minted. Nothing is sent.",
  },
  {
    id: "confirming",
    title: "Confirming",
    body: "A historical mint would wait for the confirmation floor. This keyless tour does not issue an address, observe a chain, attest a mint, or change a balance.",
  },
  {
    id: "stale",
    title: "Stale",
    body: "Observation or proof is stale. Fail closed. Nothing is minted.",
  },
  {
    id: "mint-queued",
    title: "Mint queued",
    body: "One outpoint would authorize at most one 8-decimal receipt. Nothing is minted in this simulation.",
  },
  {
    id: "complete",
    title: "Complete",
    body: "State demonstration complete. No native ZEC was received and nothing was minted.",
  },
] as const;

export type DepositTourId = (typeof DEPOSIT_TOUR)[number]["id"];

export function depositTourStep(index: number): (typeof DEPOSIT_TOUR)[number] {
  const bounded = Math.min(Math.max(index, 0), DEPOSIT_TOUR.length - 1);
  return DEPOSIT_TOUR[bounded];
}

export function depositTourById(id: string): (typeof DEPOSIT_TOUR)[number] | null {
  return DEPOSIT_TOUR.find((step) => step.id === id) ?? null;
}

export function depositTourIds(): readonly DepositTourId[] {
  return DEPOSIT_TOUR.map((step) => step.id);
}
