export const LANDING_EVIDENCE = [
  {
    title: "No pZEC",
    body: "Phlebas does not mint a wrapped ZEC receipt. Native ZEC stays ZEC.",
  },
  {
    title: "No mint",
    body: "There is no platform mint and no customer-asset receipt token.",
  },
  {
    title: "No omnibus",
    body: "Locks are funded from the parties’ wallets. There is no shared omnibus account.",
  },
  {
    title: "No shared LP token",
    body: "Solvers keep inventory in their own wallets. There is no pooled claim on customer assets.",
  },
] as const;
