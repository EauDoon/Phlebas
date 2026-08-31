import { isLoopbackOperatorUrl } from "./operator-url.ts";

export function simulationStatus(env: Record<string, string | undefined> = process.env) {
  const matcherLoopback = isLoopbackOperatorUrl(env.PHLEBAS_MATCHER_URL);
  const gatewayLoopback = isLoopbackOperatorUrl(env.PHLEBAS_GATEWAY_URL);
  return {
    name: "phlebas",
    version: "0.1.0",
    mode: "simulation",
    liveFunds: false,
    matcher: "in-browser",
    matcherService: matcherLoopback ? "loopback-optional" : "local-optional",
    custody: "none",
    deposits: "testnet-gateway-optional",
    withdrawals: "tour-only",
    wallets: "eip-1193-sepolia",
    sepoliaSubmit: "flag-off",
    contracts: "source-undeployed",
    network: "arbitrum-sepolia-unconfigured",
    marketData: "illustrative",
    countryAccess: "deny-default",
    sequenceRoot: null,
    intentCap: gatewayLoopback ? 64 : null,
  } as const;
}
