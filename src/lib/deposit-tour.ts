export const DEPOSIT_TOUR = [
  {
    id: "eligibility",
    title: "Eligibility",
    body: "A production gateway would accept eligible transparent native ZEC and issue pZEC. This preview never requests location, identity, or account information.",
  },
  {
    id: "address-request",
    title: "Address request",
    body: "No address generated in simulation. A production intent would issue one fresh ZIP 320 TEX address and never reassign it.",
  },
  {
    id: "observed",
    title: "Observed",
    body: "Independent observers would bind the outpoint, amount, destination, and tip. Zero-confirmation credit is never allowed. Nothing is observed here.",
  },
  {
    id: "screening",
    title: "Screening",
    body: "Checks in progress is a production state. This demonstration does not screen funds or promise credit.",
  },
  {
    id: "confirming",
    title: "Confirming",
    body: "A production mint waits for the confirmation floor. The local observer stub uses 10 confirmations on textest only.",
  },
  {
    id: "mint-queued",
    title: "Mint queued",
    body: "One outpoint would authorize at most one 8-decimal receipt. No pZEC is minted in this simulation.",
  },
  {
    id: "complete",
    title: "Complete",
    body: "State demonstration complete. No native ZEC was received and no pZEC was minted.",
  },
] as const;

export type DepositTourId = (typeof DEPOSIT_TOUR)[number]["id"];

export function depositTourStep(index: number): (typeof DEPOSIT_TOUR)[number] {
  const bounded = Math.min(Math.max(index, 0), DEPOSIT_TOUR.length - 1);
  return DEPOSIT_TOUR[bounded];
}
