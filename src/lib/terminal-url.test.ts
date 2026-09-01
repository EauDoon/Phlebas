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

test("settlement view stays on the trade route", () => {
  assert.equal(
    terminalUrl({ view: "settlement", market: "ZEC/USDC" }),
    "/trade?market=ZEC%2FUSDC&view=settlement",
  );
  assert.equal(
    terminalUrl({ view: "settlement", market: "ZEC/USDT", demo: "incidents" }),
    "/trade?market=ZEC%2FUSDT&view=settlement",
  );
  assert.equal(
    terminalUrl({ view: "settlement", market: "ZEC/USDC", mode: "advanced" }),
    "/trade?market=ZEC%2FUSDC&mode=advanced&view=settlement",
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
    terminalUrl({ view: "settlement", market: "ZEC/USDC", demo }),
    "/trade?market=ZEC%2FUSDC&view=settlement",
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

test("view URL preserves mode across architecture, liquidity, and trade", () => {
  const market = "ZEC/USDC" as const;
  const mode = "advanced";
  assert.equal(
    terminalUrl({ view: "trade", market, mode }),
    "/trade?market=ZEC%2FUSDC&mode=advanced&view=trade",
  );
  assert.equal(
    terminalUrl({ view: "architecture", market, mode }),
    "/trade?market=ZEC%2FUSDC&mode=advanced&view=architecture",
  );
  assert.equal(
    terminalUrl({ view: "liquidity", market, mode }),
    "/liquidity?market=ZEC%2FUSDC&mode=advanced",
  );
  assert.equal(
    terminalUrl({ view: "architecture", market, mode, demo: "incidents" }),
    "/trade?market=ZEC%2FUSDC&mode=advanced&demo=incidents&view=architecture",
  );
  assert.equal(
    terminalUrl({ view: "trade", market, mode, feed: "stale" }),
    "/trade?market=ZEC%2FUSDC&feed=stale&mode=advanced&view=trade",
  );
  assert.equal(
    terminalUrl({ view: "liquidity", market, mode, feed: "stale" }),
    "/liquidity?market=ZEC%2FUSDC&feed=stale&mode=advanced",
  );
});

test("architecture, liquidity, and trade views keep mode", () => {
  for (const view of ["architecture", "liquidity", "trade"] as const) {
    const advanced = terminalUrl({ view, market: "ZEC/USDT", mode: "advanced" });
    const simple = terminalUrl({ view, market: "ZEC/USDT", mode: "simple" });
    const omitted = terminalUrl({ view, market: "ZEC/USDT" });
    const invalid = terminalUrl({ view, market: "ZEC/USDT", mode: "pro" });
    assert.match(advanced, /[?&]mode=advanced(?:&|$)/);
    assert.doesNotMatch(simple, /[?&]mode=/);
    assert.equal(simple, omitted);
    assert.equal(invalid, omitted);
  }
  assert.equal(
    terminalUrl({ view: "architecture", market: "ZEC/USDT", mode: "advanced" }),
    "/trade?market=ZEC%2FUSDT&mode=advanced&view=architecture",
  );
  assert.equal(
    terminalUrl({ view: "architecture", market: "ZEC/USDT", mode: "simple" }),
    "/trade?market=ZEC%2FUSDT&view=architecture",
  );
  assert.equal(
    terminalUrl({ view: "liquidity", market: "ZEC/USDT", mode: "simple" }),
    "/liquidity?market=ZEC%2FUSDT",
  );
  assert.equal(
    terminalUrl({ view: "trade", market: "ZEC/USDT", mode: "simple" }),
    "/trade?market=ZEC%2FUSDT&view=trade",
  );
});

test("historical bridge deep link omits demo=incidents and Architecture restores it", () => {
  assert.equal(
    terminalUrl({ view: "bridge", market: "ZEC/USDT", demo: "incidents" }),
    "/trade?market=ZEC%2FUSDT&view=bridge",
  );
  assert.equal(
    terminalUrl({ view: "architecture", market: "ZEC/USDT", demo: "incidents" }),
    "/trade?market=ZEC%2FUSDT&demo=incidents&view=architecture",
  );
});
