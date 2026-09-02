import assert from "node:assert/strict";
import test from "node:test";

import {
  TICKET_SIDES,
  TICKET_ORDER_TYPES,
  TICKET_TIFS,
  nextTicketSide,
  nextTicketOrderType,
  nextTicketTif,
} from "./ticket-groups.ts";

test("ticket side type and tif wrap under arrow deltas", () => {
  assert.deepEqual([...TICKET_SIDES], ["buy", "sell"]);
  assert.equal(nextTicketSide("buy", 1), "sell");
  assert.equal(nextTicketSide("sell", 1), "buy");
  assert.equal(nextTicketSide("buy", -1), "sell");

  assert.deepEqual([...TICKET_ORDER_TYPES], ["limit", "market", "twap"]);
  assert.equal(nextTicketOrderType("limit", 1), "market");
  assert.equal(nextTicketOrderType("market", 1), "twap");
  assert.equal(nextTicketOrderType("twap", 1), "limit");
  assert.equal(nextTicketOrderType("twap", -1), "market");

  assert.deepEqual([...TICKET_TIFS], ["GTC", "IOC", "FOK"]);
  assert.equal(nextTicketTif("GTC", 1), "IOC");
  assert.equal(nextTicketTif("FOK", 1), "GTC");
  assert.equal(nextTicketTif("GTC", -1), "FOK");
});
