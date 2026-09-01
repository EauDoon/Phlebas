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
  MAINNET_STABLECOINS,
  NATIVE_ZEC_ASSET,
  USDT0_LISTING_STATUS,
  ZCASH_MAINNET_NETWORK,
  assertEthereumMainnetChainId,
  assertMainnetQuoteSymbol,
  assertMainnetStablecoinAddress,
  mainnetMarket,
  mainnetStablecoin,
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
  assert.deepEqual(Object.keys(MAINNET_MARKETS), ["ZEC/USDC", "ZEC/USDT"]);
  assert.equal(usdc.settlementPair, "ZEC-USDC");
  assert.equal(usdt.settlementPair, "ZEC-USDT");
  assert.equal(usdc.base, usdt.base);
  assert.equal(usdc.base.environment, "mainnet");
  assert.equal(usdc.base.addressScope, "transparent-only");
  assert.equal(usdc.quote.name, "USD Coin");
  assert.equal(usdt.quote.name, "Tether USD");
  assert.equal(usdc.quote.issuer, "Circle");
  assert.equal(usdt.quote.issuer, "Tether");
  assert.equal(usdc.quote.decimals, 6);
  assert.equal(usdt.quote.decimals, 6);
  assert.equal(usdc.quote.network, ETHEREUM_MAINNET_NETWORK);
  assert.equal(usdt.quote.network, ETHEREUM_MAINNET_NETWORK);
  assert.equal(usdc.quote.address, ETHEREUM_MAINNET_USDC_ADDRESS);
  assert.equal(usdt.quote.address, ETHEREUM_MAINNET_USDT_ADDRESS);
  assert.equal(mainnetStablecoin("USDC"), MAINNET_STABLECOINS.USDC);
  assert.equal(mainnetStablecoin("USDT"), MAINNET_STABLECOINS.USDT);
  assert.equal(Object.isFrozen(MAINNET_MARKETS), true);
  assert.equal(Object.isFrozen(MAINNET_STABLECOINS.USDC), true);
  assert.equal(Object.isFrozen(MAINNET_STABLECOINS.USDT), true);
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
  assert.equal(assertMainnetQuoteSymbol("USDC"), "USDC");
  assert.equal(assertMainnetQuoteSymbol("USDT"), "USDT");
  assert.equal(
    assertMainnetStablecoinAddress("USDC", ETHEREUM_MAINNET_USDC_ADDRESS.toUpperCase().replace("0X", "0x")),
    ETHEREUM_MAINNET_USDC_ADDRESS,
  );
  assert.equal(
    assertMainnetStablecoinAddress("USDC", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
    ETHEREUM_MAINNET_USDC_ADDRESS,
  );
  assert.equal(
    assertMainnetStablecoinAddress("USDT", "0xdAC17F958D2ee523a2206206994597C13D831ec7"),
    ETHEREUM_MAINNET_USDT_ADDRESS,
  );
  assert.throws(() => assertEthereumMainnetChainId(1), /chain ID 1/);
  assert.throws(() => assertEthereumMainnetChainId("1"), /chain ID 1/);
  assert.throws(() => assertEthereumMainnetChainId("0x66eee"), /chain ID 1/);
  assert.throws(() => assertEthereumMainnetChainId("0xa4b1"), /chain ID 1/);
  assert.throws(
    () => assertMainnetStablecoinAddress("USDT", ETHEREUM_MAINNET_USDC_ADDRESS),
    /not the approved Ethereum Mainnet asset/,
  );
  assert.throws(
    () => assertMainnetStablecoinAddress("USDC", "0xaf88d065e77c8cc2239327c5edb3a432268e5831"),
    /not the approved Ethereum Mainnet asset/,
  );
  assert.throws(() => assertMainnetStablecoinAddress("USDC", "0x1234"), /20-byte/);
  assert.throws(() => assertMainnetQuoteSymbol("DAI"), /not an approved Ethereum Mainnet stablecoin/);
  assert.throws(() => mainnetMarket("ZEC/DAI" as "ZEC/USDC"), /not an approved Ethereum Mainnet pair/);
});

test("USDT0 remains abandoned and cannot substitute for either listed quote", () => {
  assert.equal(USDT0_LISTING_STATUS, "abandoned");
  assert.throws(() => assertMainnetQuoteSymbol("USDT0"), /USDT0 is abandoned/);
  assert.throws(() => mainnetStablecoin("USDT0" as "USDT"), /USDT0 is abandoned/);
  assert.throws(() => mainnetMarket("ZEC/USDT0" as "ZEC/USDT"), /USDT0 is abandoned/);
  assert.throws(
    () => assertMainnetStablecoinAddress("USDT", "0x6C96dE32CEa08842dcc4058c14d3aaAD7Fa41dee"),
    /USDT0 is abandoned/,
  );
  assert.throws(
    () => assertMainnetStablecoinAddress("USDC", "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9"),
    /USDT0 is abandoned/,
  );
});
