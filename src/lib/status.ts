export function simulationStatus() {
  return {
    name: "phlebas",
    version: "0.1.0",
    mode: "simulation",
    liveFunds: false,
    matcher: "in-browser",
    custody: "none",
    deposits: "disabled",
    withdrawals: "tour-only",
    wallets: "disabled",
    contracts: "not-deployed",
    network: "none",
    marketData: "illustrative",
  } as const;
}
