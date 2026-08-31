export function simulationStatus() {
  return {
    name: "phlebas",
    version: "0.1.0",
    mode: "simulation",
    liveFunds: false,
    matcher: "in-browser",
    matcherService: "local-optional",
    custody: "none",
    deposits: "testnet-gateway-optional",
    withdrawals: "tour-only",
    wallets: "eip-1193-sepolia",
    sepoliaSubmit: "flag-off",
    contracts: "source-undeployed",
    network: "arbitrum-sepolia-unconfigured",
    marketData: "illustrative",
  } as const;
}
