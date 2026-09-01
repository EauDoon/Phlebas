import assert from "node:assert/strict";
import test from "node:test";

import {
  LANDING_BANNER,
  LANDING_FOOTER,
  LANDING_HEADER_STATUS,
  LANDING_HERO,
  LANDING_LEDGER,
  LANDING_LEDGER_HEADING,
  LANDING_LEDGER_NOTE,
  LANDING_LEDGER_PILL,
  LANDING_MARKETS,
  LANDING_MARKETS_INTRO,
  LANDING_NAV,
  LANDING_PATHS_INTRO,
  PRODUCT_NAV,
  LANDING_SETTLEMENT_INTRO,
  LANDING_SETTLEMENT_STEPS,
  LANDING_SKIP_LINKS,
  LANDING_STATUS_DETAILS,
  LANDING_TERMINAL_PREVIEW,
  LANDING_WHY_NOT_WRAPPED_INTRO,
} from "./landing-copy.ts";

function corpus(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(corpus).join("\n");
  }
  if (value && typeof value === "object") {
    return Object.values(value).map(corpus).join("\n");
  }
  return "";
}

const shipped = corpus({
  LANDING_BANNER,
  LANDING_FOOTER,
  LANDING_HEADER_STATUS,
  LANDING_HERO,
  LANDING_LEDGER,
  LANDING_LEDGER_HEADING,
  LANDING_LEDGER_NOTE,
  LANDING_LEDGER_PILL,
  LANDING_MARKETS,
  LANDING_MARKETS_INTRO,
  LANDING_NAV,
  LANDING_PATHS_INTRO,
  LANDING_SETTLEMENT_INTRO,
  LANDING_SETTLEMENT_STEPS,
  LANDING_SKIP_LINKS,
  LANDING_STATUS_DETAILS,
  LANDING_TERMINAL_PREVIEW,
  LANDING_WHY_NOT_WRAPPED_INTRO,
});

test("landing hero uses the shipped pre-launch product copy", () => {
  assert.equal(LANDING_HERO.eyebrow, "Transparent ZEC markets");
  assert.equal(LANDING_HERO.heading, "Native ZEC. Native stables. No platform balance.");
  assert.equal(
    LANDING_HERO.supporting,
    "Phlebas matches ZEC/USDC and ZEC/USDT as a professional order book. Each fill settles with one Zcash lock and one exact-token EVM lock, funded from the parties’ wallets. Claim and refund are mutually exclusive. The matcher never holds the assets.",
  );
  assert.equal(LANDING_HERO.primaryAction, "Open terminal");
  assert.equal(LANDING_HERO.primaryHref, "/trade?view=trade");
  assert.equal(LANDING_HERO.secondaryAction, "How settlement works");
  assert.equal(LANDING_HERO.secondaryHref, "/trade?view=settlement");
  assert.equal(
    LANDING_HERO.disclosure,
    "Nothing here can be bought, sold, deposited, withdrawn, or redeemed.",
  );
});

test("landing ledger names the public preview bounds", () => {
  assert.equal(LANDING_LEDGER_HEADING, "Current system");
  assert.deepEqual(
    LANDING_LEDGER.map((row) => [row.label, row.value]),
    [
      ["Product", "Public preview"],
      ["Market data", "Illustrative"],
      ["Wallets", "Off"],
      ["Contracts", "Not deployed"],
      ["Custody", "None"],
      ["Mainnet", "Not cleared"],
      ["Country access", "Deny by default"],
    ],
  );
  assert.equal(LANDING_LEDGER[2]?.value, "Off");
  assert.doesNotMatch(corpus(LANDING_LEDGER), /Unavailable|Illustrative fixtures|No-value preview/i);
});

test("landing skip links follow the shipped section ids", () => {
  assert.deepEqual(
    LANDING_SKIP_LINKS.map((link) => link.href),
    [
      "#main-content",
      "#markets",
      "#settlement-how",
      "#why-not-wrapped",
      "#terminal-preview",
      "#paths",
    ],
  );
  const hrefs = LANDING_SKIP_LINKS.map((link) => link.href as string);
  assert.equal(hrefs.includes("#exists-today"), false);
  assert.equal(hrefs.includes("#pairs"), false);
  assert.equal(hrefs.includes("#journeys"), false);
  assert.equal(LANDING_SKIP_LINKS.some((link) => /pZEC|deposit/i.test(link.href + link.label)), false);
});

test("two markets name ZEC/USDC first and abandon USDT0", () => {
  assert.equal(LANDING_MARKETS[0]?.title, "ZEC / USDC");
  assert.match(LANDING_MARKETS[0].kicker, /First settlement target/i);
  assert.equal(LANDING_MARKETS[1]?.title, "ZEC / USDT");
  assert.match(LANDING_MARKETS[1].kicker, /exact token identity/i);
  assert.match(LANDING_MARKETS_INTRO.supporting, /USDT0 is abandoned/);
  assert.doesNotMatch(corpus(LANDING_MARKETS), /USDT0/);
});

test("settlement copy is four fill steps, not a lab demo", () => {
  assert.equal(LANDING_SETTLEMENT_STEPS.length, 4);
  assert.deepEqual(
    LANDING_SETTLEMENT_STEPS.map((step) => step.title),
    [
      "Signed order",
      "Matched fill",
      "ZEC lock, then stablecoin lock",
      "Claim or refund",
    ],
  );
  assert.doesNotMatch(corpus(LANDING_SETTLEMENT_INTRO), /walkthrough|inspect/i);
  assert.doesNotMatch(corpus(LANDING_SETTLEMENT_STEPS), /walkthrough|inspect/i);
});

test("why-not-wrapped copy rejects pZEC as the live product", () => {
  assert.match(LANDING_WHY_NOT_WRAPPED_INTRO.heading, /No pZEC/);
  assert.match(LANDING_WHY_NOT_WRAPPED_INTRO.supporting, /Solvers keep inventory in their own wallets/);
});

test("terminal preview chip is enough and the frame cannot fill", () => {
  assert.equal(LANDING_TERMINAL_PREVIEW.chip, LANDING_HEADER_STATUS);
  assert.equal(LANDING_TERMINAL_PREVIEW.bound, LANDING_TERMINAL_PREVIEW.supporting);
  assert.match(LANDING_TERMINAL_PREVIEW.bound, /cannot submit, sign, or fill/);
  assert.equal(LANDING_TERMINAL_PREVIEW.cta, LANDING_HERO.primaryAction);
  assert.equal(LANDING_TERMINAL_PREVIEW.href, LANDING_HERO.primaryHref);
});

test("paths intro names Trade, Provide quotes, and Read settlement", () => {
  assert.equal(LANDING_PATHS_INTRO.eyebrow, "Choose a path");
  assert.equal(LANDING_PATHS_INTRO.heading, "Trade. Provide quotes. Read settlement.");
});

test("shipped landing copy fails closed on live-funds and banned product claims", () => {
  assert.equal(
    LANDING_FOOTER,
    "Phlebas is not a live exchange and not an offer of financial services.",
  );
  assert.doesNotMatch(LANDING_FOOTER, /protocol preview/i);
  assert.doesNotMatch(shipped, /\btrustless\b/i);
  assert.doesNotMatch(shipped, /\bis audited\b/i);
  assert.doesNotMatch(shipped, /\bpayable\b/i);
  assert.doesNotMatch(shipped, /\bshielded market\b/i);
  assert.doesNotMatch(shipped, /\bis a live exchange\b/i);
  assert.doesNotMatch(shipped, /\blive funds\b/i);
  assert.doesNotMatch(shipped, /native labels are already live settlement/i);
  assert.doesNotMatch(shipped, /USDT0 is listed|lists USDT0|USDT0 listing/i);
  assert.match(shipped, /USDT0 is abandoned/);
  assert.match(shipped, /No pZEC/);
  assert.doesNotMatch(shipped, /pZEC is (?:the live|native|the product)/i);
});

test("product nav is Markets Terminal Liquidity Docs Status", () => {
  assert.deepEqual(
    PRODUCT_NAV.map((item) => item.label),
    ["Markets", "Terminal", "Liquidity", "Docs", "Status"],
  );
  assert.equal(PRODUCT_NAV[0]?.href, "/#markets");
  assert.equal(PRODUCT_NAV[1]?.href, "/trade?view=trade");
  assert.equal(PRODUCT_NAV[2]?.href, "/liquidity");
  assert.equal(PRODUCT_NAV[3]?.href, "/trade?view=architecture");
  assert.equal(PRODUCT_NAV[4]?.href, "/status");
});

test("operational landing labels drop simulator vocabulary", () => {
  const operational = corpus({
    LANDING_BANNER,
    LANDING_HEADER_STATUS,
    LANDING_HERO,
    LANDING_LEDGER,
    LANDING_LEDGER_PILL,
    LANDING_NAV,
    LANDING_SKIP_LINKS,
    LANDING_TERMINAL_PREVIEW,
    LANDING_PATHS_INTRO,
  });
  assert.doesNotMatch(operational, /\bsimulations?\b/i);
  assert.doesNotMatch(operational, /\bsimulator\b/i);
  assert.doesNotMatch(operational, /\bfixture\b/i);
  assert.doesNotMatch(operational, /\bno-value\b/i);
  assert.doesNotMatch(operational, /\binspect\b/i);
  assert.doesNotMatch(operational, /\bwalkthrough\b/i);
  assert.doesNotMatch(operational, /\bpreview-only\b/i);
  assert.doesNotMatch(operational, /illustrative fixture/i);
});
