import assert from "node:assert/strict";
import test from "node:test";

import {
  ETHEREUM_MAINNET_CHAIN_HEX,
  ETHEREUM_MAINNET_CHAIN_ID,
  ETHEREUM_MAINNET_NETWORK,
  ETHEREUM_MAINNET_USDC_ADDRESS,
  ETHEREUM_MAINNET_USDC_ASSET,
  ETHEREUM_MAINNET_USDT_ADDRESS,
  ETHEREUM_MAINNET_USDT_ASSET,
  MAINNET_MARKETS,
  NATIVE_ZEC_ASSET,
  ZCASH_MAINNET_NETWORK,
  assertEthereumMainnetChainId,
  assertMainnetStablecoinAddress,
  mainnetMarket,
} from "./mainnet-assets.ts";

test("mainnet assets bind exact native ZEC and Ethereum stablecoins", () => {
  assert.equal(ETHEREUM_MAINNET_CHAIN_ID, 1n);
  assert.equal(ETHEREUM_MAINNET_CHAIN_HEX, "0x1");
  assert.equal(ETHEREUM_MAINNET_NETWORK, "eip155:1");
  assert.equal(ZCASH_MAINNET_NETWORK, "bip122:00040fe8ec8471911baa1db1266ea15d");
  assert.equal(NATIVE_ZEC_ASSET, `${ZCASH_MAINNET_NETWORK}/slip44:133`);
  assert.equal(ETHEREUM_MAINNET_USDC_ADDRESS, "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
  assert.equal(ETHEREUM_MAINNET_USDT_ADDRESS, "0xdac17f958d2ee523a2206206994597c13d831ec7");
  assert.equal(ETHEREUM_MAINNET_USDC_ASSET, `${ETHEREUM_MAINNET_NETWORK}/erc20:${ETHEREUM_MAINNET_USDC_ADDRESS}`);
  assert.equal(ETHEREUM_MAINNET_USDT_ASSET, `${ETHEREUM_MAINNET_NETWORK}/erc20:${ETHEREUM_MAINNET_USDT_ADDRESS}`);
});

test("both exchange markets settle against the exact six-decimal Ethereum Mainnet quote", () => {
  const usdc = mainnetMarket("ZEC/USDC");
  const usdt = mainnetMarket("ZEC/USDT");
  assert.equal(usdc.settlementPair, "ZEC-USDC");
  assert.equal(usdt.settlementPair, "ZEC-USDT");
  assert.equal(usdc.base, usdt.base);
  assert.equal(usdc.base.environment, "mainnet");
  assert.equal(usdc.base.addressScope, "transparent-only");
  assert.equal(usdc.quote.decimals, 6);
  assert.equal(usdt.quote.decimals, 6);
  assert.equal(usdc.quote.network, ETHEREUM_MAINNET_NETWORK);
  assert.equal(usdt.quote.network, ETHEREUM_MAINNET_NETWORK);
  assert.equal(Object.isFrozen(MAINNET_MARKETS), true);
});

test("USDT retains its zero-first allowance constraint and unlimited approvals stay forbidden", () => {
  assert.equal(mainnetMarket("ZEC/USDC").quote.allowancePolicy, "exact");
  assert.equal(mainnetMarket("ZEC/USDT").quote.allowancePolicy, "zero-first-then-exact");
  assert.equal(mainnetMarket("ZEC/USDC").quote.unlimitedApprovalAllowed, false);
  assert.equal(mainnetMarket("ZEC/USDT").quote.unlimitedApprovalAllowed, false);
  assert.equal(mainnetMarket("ZEC/USDT").quote.transferAccounting, "exact-balance-delta");
});

test("chain and token guards fail closed on legacy or substituted assets", () => {
  assert.equal(assertEthereumMainnetChainId("0x01"), ETHEREUM_MAINNET_CHAIN_HEX);
  assert.equal(
    assertMainnetStablecoinAddress("USDC", ETHEREUM_MAINNET_USDC_ADDRESS.toUpperCase().replace("0X", "0x")),
    ETHEREUM_MAINNET_USDC_ADDRESS,
  );
  assert.throws(() => assertEthereumMainnetChainId("0x66eee"), /chain ID 1/);
  assert.throws(() => assertEthereumMainnetChainId("0xa4b1"), /chain ID 1/);
  assert.throws(
    () => assertMainnetStablecoinAddress("USDT", ETHEREUM_MAINNET_USDC_ADDRESS),
    /not the approved Ethereum Mainnet asset/,
  );
  assert.throws(() => assertMainnetStablecoinAddress("USDC", "0x1234"), /20-byte/);
});
