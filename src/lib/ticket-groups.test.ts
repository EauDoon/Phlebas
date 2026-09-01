import assert from "node:assert/strict";
import test from "node:test";

import {
  TICKET_SIDES,
  TICKET_ORDER_TYPES,
  TICKET_TIFS,
  effectiveTicketOrderType,
  effectiveTicketTif,
  nextTicketSide,
  nextTicketOrderType,
  nextTicketTif,
} from "./ticket-groups.ts";

test("ticket side type and tif wrap under arrow deltas", () => {
  assert.deepEqual([...TICKET_SIDES], ["buy", "sell"]);
  assert.equal(nextTicketSide("buy", 1), "sell");
  assert.equal(nextTicketSide("sell", 1), "buy");
  assert.equal(nextTicketSide("buy", -1), "sell");

  assert.deepEqual([...TICKET_ORDER_TYPES], ["limit", "market"]);
  assert.equal(nextTicketOrderType("limit", 1), "market");
  assert.equal(nextTicketOrderType("market", 1), "limit");

  assert.deepEqual([...TICKET_TIFS], ["GTC", "IOC", "FOK"]);
  assert.equal(nextTicketTif("GTC", 1), "IOC");
  assert.equal(nextTicketTif("FOK", 1), "GTC");
  assert.equal(nextTicketTif("GTC", -1), "FOK");
});

test("simple mode is market IOC; advanced limit keeps GTC", () => {
  assert.equal(effectiveTicketOrderType("simple", "limit"), "market");
  assert.equal(effectiveTicketOrderType("simple", "market"), "market");
  assert.equal(effectiveTicketTif("simple", "limit", "GTC"), "IOC");
  assert.equal(effectiveTicketTif("simple", "market", "FOK"), "IOC");

  assert.equal(effectiveTicketOrderType("advanced", "limit"), "limit");
  assert.equal(effectiveTicketOrderType("advanced", "market"), "market");
  assert.equal(effectiveTicketTif("advanced", "limit", "GTC"), "GTC");
  assert.equal(effectiveTicketTif("advanced", "limit", "FOK"), "FOK");
  assert.equal(effectiveTicketTif("advanced", "market", "GTC"), "IOC");
});
