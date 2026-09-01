import assert from "node:assert/strict";
import test from "node:test";

import { terminalUrl } from "./terminal-url.ts";

test("architecture keeps demo=incidents when the market changes", () => {
  assert.equal(
    terminalUrl({ view: "architecture", market: "ZEC/USDC", demo: "incidents" }),
    "/trade?market=ZEC%2FUSDC&demo=incidents&view=architecture",
  );
  assert.equal(
    terminalUrl({ view: "architecture", market: "ZEC/USDT", demo: "incidents" }),
    "/trade?market=ZEC%2FUSDT&demo=incidents&view=architecture",
  );
});

test("demo=incidents is omitted off architecture and for invalid values", () => {
  assert.equal(
    terminalUrl({ view: "trade", market: "ZEC/USDC", demo: "incidents" }),
    "/trade?market=ZEC%2FUSDC&view=trade",
  );
  assert.equal(
    terminalUrl({ view: "architecture", market: "ZEC/USDC", demo: "live" }),
    "/trade?market=ZEC%2FUSDC&view=architecture",
  );
  assert.match(
    terminalUrl({ view: "liquidity", market: "ZEC/USDC", feed: "stale" }),
    /^\/liquidity\?market=ZEC%2FUSDC&feed=stale$/,
  );
});

test("Trade and Liquidity drop demo=incidents and Architecture restores it", () => {
  const demo = "incidents" as const;
  assert.equal(
    terminalUrl({ view: "architecture", market: "ZEC/USDC", demo }),
    "/trade?market=ZEC%2FUSDC&demo=incidents&view=architecture",
  );
  assert.equal(
    terminalUrl({ view: "trade", market: "ZEC/USDC", demo }),
    "/trade?market=ZEC%2FUSDC&view=trade",
  );
  assert.equal(
    terminalUrl({ view: "liquidity", market: "ZEC/USDT", demo }),
    "/liquidity?market=ZEC%2FUSDT",
  );
  assert.equal(
    terminalUrl({ view: "bridge", market: "ZEC/USDC", demo }),
    "/trade?market=ZEC%2FUSDC&view=bridge",
  );
  assert.equal(
    terminalUrl({ view: "architecture", market: "ZEC/USDT", demo }),
    "/trade?market=ZEC%2FUSDT&demo=incidents&view=architecture",
  );
});

test("advanced mode is explicit in the URL and simple is the omitted default", () => {
  assert.equal(
    terminalUrl({ view: "trade", market: "ZEC/USDC", mode: "simple" }),
    "/trade?market=ZEC%2FUSDC&view=trade",
  );
  assert.equal(
    terminalUrl({ view: "trade", market: "ZEC/USDC", mode: "advanced" }),
    "/trade?market=ZEC%2FUSDC&mode=advanced&view=trade",
  );
  assert.match(
    terminalUrl({ view: "liquidity", market: "ZEC/USDT", mode: "advanced" }),
    /^\/liquidity\?market=ZEC%2FUSDT&mode=advanced$/,
  );
});

test("ZEC gateway omits demo=incidents and Architecture restores it", () => {
  assert.equal(
    terminalUrl({ view: "bridge", market: "ZEC/USDT", demo: "incidents" }),
    "/trade?market=ZEC%2FUSDT&view=bridge",
  );
  assert.equal(
    terminalUrl({ view: "architecture", market: "ZEC/USDT", demo: "incidents" }),
    "/trade?market=ZEC%2FUSDT&demo=incidents&view=architecture",
  );
});
