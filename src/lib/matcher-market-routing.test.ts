import assert from "node:assert/strict";
import test from "node:test";

import {
  ETHEREUM_MAINNET_USDC_ASSET,
  ETHEREUM_MAINNET_USDT_ASSET,
} from "./mainnet-assets.ts";
import { NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT } from "./native-zec-usdc-matcher-manifest.ts";
import { NATIVE_ZEC_USDT_MATCHER_DEPLOYMENT } from "./native-zec-usdt-matcher-manifest.ts";
import {
  exactMatcherMarketSelection,
  matcherApiPathForMarket,
  matcherDeploymentForMarket,
  matcherMarketIdForIdentity,
} from "./matcher-market-routing.ts";

test("selects only the exact tracked deployment for each mainnet market", () => {
  const usdc = matcherDeploymentForMarket("ZEC/USDC");
  const usdt = matcherDeploymentForMarket("ZEC/USDT");
  assert.equal(usdc?.manifest.market.id, "ZEC/USDC");
  assert.equal(usdc?.market.quote.asset, ETHEREUM_MAINNET_USDC_ASSET);
  assert.equal(usdt?.manifest.market.id, "ZEC/USDT");
  assert.equal(usdt?.market.quote.asset, ETHEREUM_MAINNET_USDT_ASSET);
  assert.equal(usdc?.enabled, false);
  assert.equal(usdt?.enabled, false);
  assert.equal(matcherDeploymentForMarket(undefined), null);
  assert.equal(matcherDeploymentForMarket("zec/usdt"), null);
  assert.equal(matcherDeploymentForMarket("ZEC/DAI"), null);
});

test("requires exactly one market query and rejects unknown or duplicate routing fields", () => {
  const usdt = exactMatcherMarketSelection(new URLSearchParams("market=ZEC%2FUSDT"));
  assert.equal(usdt?.marketId, "ZEC/USDT");
  assert.equal(usdt?.deployment.manifest.market.id, "ZEC/USDT");

  const account = exactMatcherMarketSelection(
    new URLSearchParams("market=ZEC%2FUSDC&account=0x11"),
    "account",
  );
  assert.equal(account?.marketId, "ZEC/USDC");

  assert.equal(exactMatcherMarketSelection(new URLSearchParams()), null);
  assert.equal(exactMatcherMarketSelection(new URLSearchParams("market=ZEC%2FUSDC&market=ZEC%2FUSDT")), null);
  assert.equal(exactMatcherMarketSelection(new URLSearchParams("market=ZEC%2FUSDT&account=0x11")), null);
  assert.equal(exactMatcherMarketSelection(new URLSearchParams("market=ZEC%2FUSDT&other=1")), null);
  assert.equal(exactMatcherMarketSelection(new URLSearchParams("market=ZEC%2FUSDT&action=a&action=b"), "action"), null);
});

test("builds explicit encoded API paths and derives no market from a substituted identity", () => {
  assert.equal(matcherApiPathForMarket("ZEC/USDC"), "/api/matcher?market=ZEC%2FUSDC");
  assert.equal(matcherApiPathForMarket("ZEC/USDT"), "/api/matcher?market=ZEC%2FUSDT");
  assert.equal(matcherMarketIdForIdentity(NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT.market), "ZEC/USDC");
  assert.equal(matcherMarketIdForIdentity(NATIVE_ZEC_USDT_MATCHER_DEPLOYMENT.market), "ZEC/USDT");

  const substituted = {
    base: NATIVE_ZEC_USDT_MATCHER_DEPLOYMENT.market.base,
    quote: { ...NATIVE_ZEC_USDT_MATCHER_DEPLOYMENT.market.quote, asset: `${ETHEREUM_MAINNET_USDC_ASSET}-substituted` },
  };
  assert.throws(() => matcherMarketIdForIdentity(substituted), /not an exact approved mainnet market/);
});
