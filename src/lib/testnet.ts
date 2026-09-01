import manifest from "../../infra/testnet/arbitrum-sepolia.json" with { type: "json" };

import { ARBITRUM_SEPOLIA_CHAIN_ID } from "./eip712.ts";
import { isOnchainAddress } from "./sepolia-manifest.ts";

function configuredAddress(value: string | null, fallback: string, label: string): string {
  if (!manifest.deployed) return fallback;
  if (!isOnchainAddress(value)) throw new Error(`Deployed Sepolia manifest is missing ${label}`);
  return value;
}

if (manifest.deployed && manifest.chainId !== Number(ARBITRUM_SEPOLIA_CHAIN_ID)) {
  throw new Error("Deployed testnet manifest is not Arbitrum Sepolia");
}

export const TESTNET = {
  chainId: ARBITRUM_SEPOLIA_CHAIN_ID,
  networkName: "Arbitrum Sepolia",
  deployed: false,
  zec: configuredAddress(manifest.contracts.Zec, "0x0000000000000000000000000000000000000001", "Zec"),
  usdc: configuredAddress(manifest.contracts.TUsdc, "0x0000000000000000000000000000000000000002", "TUsdc"),
  usdt: configuredAddress(manifest.contracts.TUsdt, "0x0000000000000000000000000000000000000003", "TUsdt"),
  settlement: configuredAddress(
    manifest.contracts.Settlement,
    "0x0000000000000000000000000000000000000000",
    "Settlement",
  ),
} as const;

export function quoteTokenAddress(quote: "USDC" | "USDT"): string {
  return quote === "USDT" ? TESTNET.usdt : TESTNET.usdc;
}
