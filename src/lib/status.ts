import { isLoopbackOperatorUrl } from "./operator-url.ts";

export function simulationStatus(env: Record<string, string | undefined> = process.env) {
  const usdcMatcherLoopback = isLoopbackOperatorUrl(env.PHLEBAS_MATCHER_USDC_URL ?? env.PHLEBAS_MATCHER_URL);
  const usdtMatcherLoopback = isLoopbackOperatorUrl(env.PHLEBAS_MATCHER_USDT_URL);
  const matcherService = usdcMatcherLoopback && usdtMatcherLoopback
    ? "persistent-native-v1-loopback-both"
    : usdcMatcherLoopback
      ? "persistent-native-v1-loopback-usdc"
      : usdtMatcherLoopback
        ? "persistent-native-v1-loopback-usdt"
        : "off";
  return {
    name: "phlebas",
    version: "0.1.0",
    mode: "preview",
    liveFunds: false,
    matcher: "in-browser",
    matcherService,
    matcherTarget: "persistent-signed-order-v1",
    matcherExecution: "blocked-no-value-swap-plans",
    solverLiquidity: "wallet-held-signed-quotes",
    authoritativeJournal: "off-vercel",
    custody: "none",
    deposits: "disabled-fill-specific-wallet-locks",
    withdrawals: "disabled-claim-or-refund-only",
    wallets: "eip-6963-ethereum-mainnet",
    mainnetTransactions: "disabled-until-deployment-evidence",
    contracts: "conditional-lock-undeployed",
    network: "zcash-mainnet-and-ethereum-mainnet",
    marketData: "illustrative",
    countryAccess: "deny-default",
    incidents: "architecture-demonstration",
    sequenceRoot: null,
  } as const;
}
