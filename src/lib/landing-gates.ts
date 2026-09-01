export const LANDING_GATE_STATUS = "Not cleared";

export const LANDING_GATES_INTRO = {
  eyebrow: "Not cleared for real assets",
  heading: "Mainnet is not cleared.",
} as const;

export const LANDING_GATES_SUMMARY =
  "Mainnet stays closed until written evidence exists. Read the launch gates.";

export const LANDING_GATES_ACTION = "Read the launch gates";

export const LANDING_GATES_HREF = "/trade?view=architecture";

export const LANDING_MAINNET_GATES = [
  "Licensed entity and approved countries.",
  "Custody operator and customer-asset treatment.",
  "Independent contract and infrastructure reviews.",
  "Anti-money laundering, sanctions, Travel Rule, and market surveillance controls.",
  "Reserve and liability reconciliation with tested incident handling.",
  "Final approval for USDC and USDT. USDT0 is abandoned.",
] as const;
