import assert from "node:assert/strict";
import test from "node:test";

import { sizeAtomsForQuote, worstPriceTicks } from "./units.ts";
import {
  TICKET_MAX_EMPTY_QUOTE_COPY,
  TICKET_MAX_EMPTY_ZEC_COPY,
  TICKET_MAX_LIMIT_PRICE_COPY,
  TICKET_MAX_SLIPPAGE_COPY,
  maxTicketSizeAtoms,
  maxTicketSizeAtomsForShare,
  ticketInventoryShare,
  ticketMaxPriceTicks,
  ticketMaxUnavailableCopy,
} from "./ticket-size.ts";

const BANNED_LABEL = /simulation|simulator|fixture|no-value|inspect|walkthrough|preview-only|illustrative fixture/i;

const SESSION_ZEC = 100_00000000n;
const SESSION_QUOTE = 10_000_000000n;
const LAST_TICKS = 5284n;
const SLIPPAGE_HUNDREDTHS = 50n;

test("sell max is available ZEC and ignores quote inventory", () => {
  assert.equal(
    maxTicketSizeAtoms({
      side: "sell",
      availableZecAtoms: SESSION_ZEC,
      availableQuoteAtoms: SESSION_QUOTE,
      priceTicks: 5311n,
    }),
    SESSION_ZEC,
  );
  assert.equal(
    maxTicketSizeAtoms({
      side: "sell",
      availableZecAtoms: 0n,
      availableQuoteAtoms: SESSION_QUOTE,
      priceTicks: 5311n,
    }),
    0n,
  );
  assert.equal(ticketMaxPriceTicks({
    side: "sell",
    orderType: "market",
    limitPriceTicks: 5291n,
    lastTicks: LAST_TICKS,
    slippageHundredths: SLIPPAGE_HUNDREDTHS,
  }), 1n);
});

test("buy max inverts quote inventory at the integer bound", () => {
  const quoteAtoms = SESSION_QUOTE;
  const priceTicks = 5311n;
  assert.equal(
    maxTicketSizeAtoms({
      side: "buy",
      availableZecAtoms: SESSION_ZEC,
      availableQuoteAtoms: quoteAtoms,
      priceTicks,
    }),
    sizeAtomsForQuote(quoteAtoms, priceTicks),
  );
  assert.ok(sizeAtomsForQuote(quoteAtoms, priceTicks) > 0n);
});

test("simple-mode Max buy uses worst price; Max sell is session ZEC", () => {
  const buyPrice = ticketMaxPriceTicks({
    side: "buy",
    orderType: "market",
    limitPriceTicks: 5291n,
    lastTicks: LAST_TICKS,
    slippageHundredths: SLIPPAGE_HUNDREDTHS,
  });
  assert.equal(buyPrice, worstPriceTicks(LAST_TICKS, "buy", SLIPPAGE_HUNDREDTHS));
  assert.equal(buyPrice, 5311n);
  assert.equal(
    maxTicketSizeAtomsForShare({
      side: "buy",
      availableZecAtoms: SESSION_ZEC,
      availableQuoteAtoms: SESSION_QUOTE,
      priceTicks: buyPrice,
      sharePercent: 100n,
    }),
    sizeAtomsForQuote(SESSION_QUOTE, buyPrice),
  );
  assert.equal(
    maxTicketSizeAtomsForShare({
      side: "sell",
      availableZecAtoms: SESSION_ZEC,
      availableQuoteAtoms: SESSION_QUOTE,
      priceTicks: ticketMaxPriceTicks({
        side: "sell",
        orderType: "market",
        limitPriceTicks: 0n,
        lastTicks: LAST_TICKS,
        slippageHundredths: SLIPPAGE_HUNDREDTHS,
      }),
      sharePercent: 100n,
    }),
    SESSION_ZEC,
  );
  assert.equal(ticketInventoryShare(SESSION_ZEC, 50n), 50_00000000n);
  assert.equal(
    maxTicketSizeAtomsForShare({
      side: "sell",
      availableZecAtoms: SESSION_ZEC,
      availableQuoteAtoms: SESSION_QUOTE,
      priceTicks: 1n,
      sharePercent: 50n,
    }),
    50_00000000n,
  );
});

test("advanced limit Max buy uses the limit price", () => {
  assert.equal(
    ticketMaxPriceTicks({
      side: "buy",
      orderType: "limit",
      limitPriceTicks: 5291n,
      lastTicks: LAST_TICKS,
      slippageHundredths: SLIPPAGE_HUNDREDTHS,
    }),
    5291n,
  );
  assert.throws(
    () => ticketMaxPriceTicks({
      side: "buy",
      orderType: "limit",
      limitPriceTicks: 0n,
      lastTicks: LAST_TICKS,
      slippageHundredths: SLIPPAGE_HUNDREDTHS,
    }),
    /positive limit price/,
  );
});

test("buy max is zero when quote inventory or price is missing", () => {
  assert.equal(
    maxTicketSizeAtoms({
      side: "buy",
      availableZecAtoms: SESSION_ZEC,
      availableQuoteAtoms: 0n,
      priceTicks: 5311n,
    }),
    0n,
  );
  assert.equal(
    maxTicketSizeAtoms({
      side: "buy",
      availableZecAtoms: SESSION_ZEC,
      availableQuoteAtoms: SESSION_QUOTE,
      priceTicks: 0n,
    }),
    0n,
  );
});

test("Max copy has no simulation labels", () => {
  const shipped = [
    TICKET_MAX_LIMIT_PRICE_COPY,
    TICKET_MAX_SLIPPAGE_COPY,
    TICKET_MAX_EMPTY_ZEC_COPY,
    TICKET_MAX_EMPTY_QUOTE_COPY,
    ticketMaxUnavailableCopy("buy"),
    ticketMaxUnavailableCopy("sell"),
  ].join("\n");
  assert.equal(ticketMaxUnavailableCopy("sell"), TICKET_MAX_EMPTY_ZEC_COPY);
  assert.equal(ticketMaxUnavailableCopy("buy"), TICKET_MAX_EMPTY_QUOTE_COPY);
  assert.doesNotMatch(shipped, BANNED_LABEL);
});
