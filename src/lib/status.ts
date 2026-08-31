import { sepoliaSubmitEnabled } from "./sepolia-submit.ts";
import { TESTNET } from "./testnet.ts";

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
    sepoliaSubmit: sepoliaSubmitEnabled() ? "testnet-enabled" : "flag-off",
    contracts: TESTNET.deployed ? "sepolia-deployed" : "source-undeployed",
    network: TESTNET.deployed ? "arbitrum-sepolia" : "arbitrum-sepolia-unconfigured",
    marketData: "illustrative",
  } as const;
}
