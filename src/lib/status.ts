import { GATEWAY_DEFAULT_MAX_INTENTS } from "./intent-cap.ts";
import { sepoliaSubmitEnabled } from "./sepolia-submit.ts";
import { TESTNET } from "./testnet.ts";
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
    matcherService: matcherLoopback ? "persistent-native-v1-loopback" : "off",
    matcherTarget: "persistent-signed-order-v1",
    matcherExecution: "blocked-no-value-swap-plans",
    solverLiquidity: "wallet-held-signed-quotes",
    authoritativeJournal: "off-vercel",
    custody: "none",
    deposits: "testnet-gateway-optional",
    withdrawals: "tour-only",
    wallets: "eip-1193-sepolia",
    sepoliaSubmit: sepoliaSubmitEnabled(env) && TESTNET.deployed ? "testnet-enabled" : "flag-off",
    contracts: TESTNET.deployed ? "sepolia-deployed" : "source-undeployed",
    network: TESTNET.deployed ? "arbitrum-sepolia" : "arbitrum-sepolia-unconfigured",
    marketData: "illustrative",
    countryAccess: "deny-default",
    sequenceRoot: null,
    intentCap: gatewayLoopback ? GATEWAY_DEFAULT_MAX_INTENTS : null,
  } as const;
}
