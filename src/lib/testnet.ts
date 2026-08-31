import { ARBITRUM_SEPOLIA_CHAIN_ID } from "./eip712.ts";

export const TESTNET = {
  chainId: ARBITRUM_SEPOLIA_CHAIN_ID,
  networkName: "Arbitrum Sepolia",
  deployed: false,
  pzec: "0x0000000000000000000000000000000000000001",
  usdc: "0x0000000000000000000000000000000000000002",
  usdt0: "0x0000000000000000000000000000000000000003",
  settlement: "0x0000000000000000000000000000000000000000",
} as const;

export function quoteTokenAddress(quote: "USDC" | "USDT0"): string {
  return quote === "USDT0" ? TESTNET.usdt0 : TESTNET.usdc;
}
