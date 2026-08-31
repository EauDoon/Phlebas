export const WITHDRAWAL_TOUR = [
  { id: "requested", title: "Requested", body: "Amount, transparent destination, network fee, service fee, and net output would be reviewed before any burn." },
  { id: "screened", title: "Screened", body: "Eligibility and destination checks run here. Signing the burn is the last action of this state." },
  { id: "rejected", title: "Rejected", body: "Destination or eligibility failed before burn. Nothing was burned. Nothing is sent." },
  { id: "burn submitted", title: "Burn submitted", body: "An unfinalized burn is on Arbitrum. The simulation does not submit a transaction." },
  { id: "burn finalized", title: "Burn finalized", body: "After Arbitrum finality the burn is consumed once and a native payout claim exists." },
  { id: "payable", title: "Payable", body: "The ledger owes transparent ZEC. No Zcash transaction has been signed." },
  { id: "transaction_prepared", title: "Transaction prepared", body: "One claim maps to one native transaction. No completion time is promised." },
  { id: "signed", title: "Signed", body: "The exact bytes and transaction ID are committed. They cannot be swapped for a different payout." },
  { id: "broadcast", title: "Broadcast", body: "Only those committed bytes may be rebroadcast. Transparent activity is public." },
  { id: "mined", title: "Mined", body: "The payout is in a Zcash block. The close threshold has not been met." },
  { id: "unresolved", title: "Unresolved", body: "The committed transaction is invalid, stale, conflicted, or reorganized. Incident halt. Nothing is sent." },
  { id: "confirmed", title: "Confirmed", body: "State demonstration complete. Nothing was burned and no native ZEC was sent." },
] as const;

export type WithdrawalTourId = (typeof WITHDRAWAL_TOUR)[number]["id"];

export function withdrawalTourStep(index: number): (typeof WITHDRAWAL_TOUR)[number] {
  const bounded = Math.min(Math.max(index, 0), WITHDRAWAL_TOUR.length - 1);
  return WITHDRAWAL_TOUR[bounded];
}

export function withdrawalTourById(id: string): (typeof WITHDRAWAL_TOUR)[number] | null {
  return WITHDRAWAL_TOUR.find((step) => step.id === id) ?? null;
}

export function withdrawalTourIds(): readonly WithdrawalTourId[] {
  return WITHDRAWAL_TOUR.map((step) => step.id);
}
