export const ETHEREUM_MAINNET_CHAIN_ID = 1n;
export const ETHEREUM_MAINNET_CHAIN_HEX = "0x1" as const;
export const ETHEREUM_MAINNET_NETWORK = "eip155:1" as const;

export const ZCASH_MAINNET_NETWORK = "bip122:00040fe8ec8471911baa1db1266ea15d" as const;
export const NATIVE_ZEC_ASSET = `${ZCASH_MAINNET_NETWORK}/slip44:133` as const;

export const ETHEREUM_MAINNET_USDC_ADDRESS = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" as const;
export const ETHEREUM_MAINNET_USDT_ADDRESS = "0xdac17f958d2ee523a2206206994597c13d831ec7" as const;
export const ETHEREUM_MAINNET_USDC_ASSET = `${ETHEREUM_MAINNET_NETWORK}/erc20:${ETHEREUM_MAINNET_USDC_ADDRESS}` as const;
export const ETHEREUM_MAINNET_USDT_ASSET = `${ETHEREUM_MAINNET_NETWORK}/erc20:${ETHEREUM_MAINNET_USDT_ADDRESS}` as const;

export type MainnetQuoteSymbol = "USDC" | "USDT";
export type MainnetMarketId = "ZEC/USDC" | "ZEC/USDT";
export type AllowancePolicy = "exact" | "zero-first-then-exact";

export type MainnetStablecoin = Readonly<{
  symbol: MainnetQuoteSymbol;
  name: string;
  network: typeof ETHEREUM_MAINNET_NETWORK;
  chainId: typeof ETHEREUM_MAINNET_CHAIN_ID;
  address: string;
  asset: string;
  decimals: 6;
  allowancePolicy: AllowancePolicy;
  unlimitedApprovalAllowed: false;
  transferAccounting: "exact-balance-delta";
}>;

export type MainnetMarket = Readonly<{
  id: MainnetMarketId;
  settlementPair: "ZEC-USDC" | "ZEC-USDT";
  base: Readonly<{
    symbol: "ZEC";
    network: typeof ZCASH_MAINNET_NETWORK;
    asset: typeof NATIVE_ZEC_ASSET;
    environment: "mainnet";
    decimals: 8;
    addressScope: "transparent-only";
  }>;
  quote: MainnetStablecoin;
}>;

const USDC: MainnetStablecoin = Object.freeze({
  symbol: "USDC",
  name: "USD Coin",
  network: ETHEREUM_MAINNET_NETWORK,
  chainId: ETHEREUM_MAINNET_CHAIN_ID,
  address: ETHEREUM_MAINNET_USDC_ADDRESS,
  asset: ETHEREUM_MAINNET_USDC_ASSET,
  decimals: 6,
  allowancePolicy: "exact",
  unlimitedApprovalAllowed: false,
  transferAccounting: "exact-balance-delta",
});

const USDT: MainnetStablecoin = Object.freeze({
  symbol: "USDT",
  name: "Tether USD",
  network: ETHEREUM_MAINNET_NETWORK,
  chainId: ETHEREUM_MAINNET_CHAIN_ID,
  address: ETHEREUM_MAINNET_USDT_ADDRESS,
  asset: ETHEREUM_MAINNET_USDT_ASSET,
  decimals: 6,
  allowancePolicy: "zero-first-then-exact",
  unlimitedApprovalAllowed: false,
  transferAccounting: "exact-balance-delta",
});

const BASE = Object.freeze({
  symbol: "ZEC" as const,
  network: ZCASH_MAINNET_NETWORK,
  asset: NATIVE_ZEC_ASSET,
  environment: "mainnet" as const,
  decimals: 8 as const,
  addressScope: "transparent-only" as const,
});

export const MAINNET_STABLECOINS = Object.freeze({ USDC, USDT });

export const MAINNET_MARKETS: Readonly<Record<MainnetMarketId, MainnetMarket>> = Object.freeze({
  "ZEC/USDC": Object.freeze({
    id: "ZEC/USDC",
    settlementPair: "ZEC-USDC",
    base: BASE,
    quote: USDC,
  }),
  "ZEC/USDT": Object.freeze({
    id: "ZEC/USDT",
    settlementPair: "ZEC-USDT",
    base: BASE,
    quote: USDT,
  }),
});

export function mainnetMarket(marketId: MainnetMarketId): MainnetMarket {
  return MAINNET_MARKETS[marketId];
}

export function mainnetStablecoin(symbol: MainnetQuoteSymbol): MainnetStablecoin {
  return MAINNET_STABLECOINS[symbol];
}

export function assertEthereumMainnetChainId(value: unknown): typeof ETHEREUM_MAINNET_CHAIN_HEX {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)
    || BigInt(value) !== ETHEREUM_MAINNET_CHAIN_ID) {
    throw new Error("Ethereum Mainnet chain ID 1 is required");
  }
  return ETHEREUM_MAINNET_CHAIN_HEX;
}

export function assertMainnetStablecoinAddress(
  symbol: MainnetQuoteSymbol,
  value: unknown,
): MainnetStablecoin["address"] {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new TypeError(`${symbol} token address must be a 20-byte EVM address`);
  }
  const canonical = value.toLowerCase();
  const expected = mainnetStablecoin(symbol).address;
  if (canonical !== expected) throw new Error(`${symbol} token is not the approved Ethereum Mainnet asset`);
  return expected;
}
