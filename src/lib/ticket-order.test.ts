import assert from "node:assert/strict";
import test from "node:test";

import { hashOrder, TIF_GTC, TIF_IOC } from "./eip712.ts";
import { bytesToHex } from "./keccak.ts";
import { TESTNET } from "./testnet.ts";
import {
  parseExpiryUnix,
  settlementDigest,
  ticketInstruction,
  ticketOrderExpiryUnix,
  ticketOrderPriceTicks,
  TICKET_POSITIVE_PRICE_SIZE_COPY,
  TICKET_SLIPPAGE_RANGE_COPY,
  TIF_SALT,
  typedOrderFromTicket,
} from "./ticket-order.ts";
import { worstPriceTicks } from "./units.ts";

const BANNED_LABEL = /simulation|simulator|fixture|no-value|inspect|walkthrough|preview-only|illustrative fixture/i;
const MAKER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const LAST_TICKS = 5284n;
const LIMIT_TICKS = 5291n;
const SLIPPAGE_HUNDREDTHS = 50n;

test("ticket typed orders match the Solidity struct hash", () => {
  const order = typedOrderFromTicket({
    maker: MAKER,
    side: "buy",
    quote: "USDC",
    sizeAtoms: 100_000_000n,
    priceTicks: 5291n,
    nonce: 1n,
    accountEpoch: 0n,
    tif: "GTC",
  });
  assert.equal(order.salt, 1n);
  assert.equal(order.timeInForce, TIF_GTC);
  assert.equal(order.baseAsset, TESTNET.zec);
  assert.equal(order.baseAsset, "0x0000000000000000000000000000000000000001");
  assert.equal(
    bytesToHex(hashOrder(order)),
    "78d7cf7804add8ba16e86edaba899f9ea37df1d536de8dd19091f5f09c035120",
  );
  assert.equal(settlementDigest(order), "23cf06d636047955c46b031bd1e5e788d74321da1c19d01ee562b2e194cdc4e9");
});

test("advanced limit GTC keeps the limit price and GTC salt", () => {
  const instruction = ticketInstruction({
    mode: "advanced",
    orderType: "limit",
    tif: "GTC",
    side: "buy",
    limitPriceTicks: LIMIT_TICKS,
    lastTicks: LAST_TICKS,
    slippageHundredths: SLIPPAGE_HUNDREDTHS,
    expiryUnix: 1700000000n,
  });
  assert.equal(instruction.orderType, "limit");
  assert.equal(instruction.tif, "GTC");
  assert.equal(instruction.priceTicks, LIMIT_TICKS);
  assert.equal(instruction.expiryUnix, 1700000000n);
  assert.equal(ticketOrderPriceTicks({
    orderType: "limit",
    side: "buy",
    limitPriceTicks: LIMIT_TICKS,
    lastTicks: LAST_TICKS,
    slippageHundredths: SLIPPAGE_HUNDREDTHS,
  }), LIMIT_TICKS);

  const order = typedOrderFromTicket({
    maker: MAKER,
    side: "buy",
    quote: "USDC",
    sizeAtoms: 100_000_000n,
    priceTicks: instruction.priceTicks,
    nonce: 1n,
    accountEpoch: 0n,
    tif: instruction.tif,
    expiry: instruction.expiryUnix,
  });
  assert.equal(order.timeInForce, TIF_GTC);
  assert.equal(order.salt, TIF_SALT.GTC);
  assert.equal(order.limitPriceTicks, LIMIT_TICKS);
  assert.equal(order.expiry, 1700000000n);
});

test("advanced market IOC signs the worst price and overrides selected TIF", () => {
  const instruction = ticketInstruction({
    mode: "advanced",
    orderType: "market",
    tif: "GTC",
    side: "buy",
    limitPriceTicks: LIMIT_TICKS,
    lastTicks: LAST_TICKS,
    slippageHundredths: SLIPPAGE_HUNDREDTHS,
    expiryUnix: 1700000000n,
  });
  const worst = worstPriceTicks(LAST_TICKS, "buy", SLIPPAGE_HUNDREDTHS);
  assert.equal(instruction.orderType, "market");
  assert.equal(instruction.tif, "IOC");
  assert.equal(instruction.priceTicks, worst);
  assert.equal(instruction.priceTicks, 5311n);
  assert.equal(instruction.expiryUnix, 1700000000n);

  const order = typedOrderFromTicket({
    maker: MAKER,
    side: "buy",
    quote: "USDC",
    sizeAtoms: 100_000_000n,
    priceTicks: instruction.priceTicks,
    nonce: 1n,
    accountEpoch: 0n,
    tif: instruction.tif,
    expiry: instruction.expiryUnix,
  });
  assert.equal(order.timeInForce, TIF_IOC);
  assert.equal(order.salt, TIF_SALT.IOC);
  assert.equal(order.limitPriceTicks, worst);
  assert.notEqual(
    settlementDigest(order),
    settlementDigest(typedOrderFromTicket({
      maker: MAKER,
      side: "buy",
      quote: "USDC",
      sizeAtoms: 100_000_000n,
      priceTicks: LIMIT_TICKS,
      nonce: 1n,
      accountEpoch: 0n,
      tif: "GTC",
      expiry: 1700000000n,
    })),
  );
});

test("simple mode is market IOC with no expiry", () => {
  const instruction = ticketInstruction({
    mode: "simple",
    orderType: "limit",
    tif: "GTC",
    side: "sell",
    limitPriceTicks: LIMIT_TICKS,
    lastTicks: LAST_TICKS,
    slippageHundredths: SLIPPAGE_HUNDREDTHS,
    expiryUnix: 1700000000n,
  });
  assert.equal(instruction.orderType, "market");
  assert.equal(instruction.tif, "IOC");
  assert.equal(instruction.priceTicks, worstPriceTicks(LAST_TICKS, "sell", SLIPPAGE_HUNDREDTHS));
  assert.equal(instruction.expiryUnix, 0n);
  assert.equal(ticketOrderExpiryUnix("simple", 1700000000n), 0n);
  assert.equal(ticketOrderExpiryUnix("advanced", 1700000000n), 1700000000n);
});

test("expiry unix is 0 for none and changes the typed-order digest", () => {
  assert.equal(parseExpiryUnix(""), 0n);
  assert.equal(parseExpiryUnix("0"), 0n);
  assert.equal(parseExpiryUnix("1700000000"), 1700000000n);
  assert.throws(() => parseExpiryUnix("-1"), /whole unix time/);
  assert.throws(() => parseExpiryUnix("1.5"), /whole unix time/);
  const none = typedOrderFromTicket({
    maker: MAKER,
    side: "buy",
    quote: "USDC",
    sizeAtoms: 100_000_000n,
    priceTicks: 5291n,
    nonce: 1n,
    accountEpoch: 0n,
    tif: "GTC",
  });
  const expiring = typedOrderFromTicket({
    maker: MAKER,
    side: "buy",
    quote: "USDC",
    sizeAtoms: 100_000_000n,
    priceTicks: 5291n,
    nonce: 1n,
    accountEpoch: 0n,
    tif: "GTC",
    expiry: parseExpiryUnix("1700000000"),
  });
  assert.equal(none.expiry, 0n);
  assert.equal(expiring.expiry, 1700000000n);
  assert.notEqual(settlementDigest(none), settlementDigest(expiring));
});

test("ticket order copy has no simulation labels", () => {
  const shipped = [
    TICKET_POSITIVE_PRICE_SIZE_COPY,
    TICKET_SLIPPAGE_RANGE_COPY,
  ].join("\n");
  try {
    parseExpiryUnix("-1");
  } catch (error) {
    assert.equal(error instanceof Error ? error.message : "", "Expiry must be a whole unix time, or 0 for none.");
    assert.doesNotMatch(error instanceof Error ? error.message : "", BANNED_LABEL);
  }
  assert.doesNotMatch(shipped, BANNED_LABEL);
});
