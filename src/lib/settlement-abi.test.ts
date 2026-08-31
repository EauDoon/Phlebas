import assert from "node:assert/strict";
import test from "node:test";

import { SETTLE_SELECTOR, encodeSettleCalldata } from "./settlement-abi.ts";
import { typedOrderFromTicket } from "./ticket-order.ts";

const MAKER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const SIG = "0x0fd73c37f4362021fdd1693bdca85f8592eb338a7d62338504ba2cbaee2bb90f26bdec5b2efeb086308bce8a9db936bb754bfafeda2305485b91a3b1c371ee8b1b";

test("settle selector is the first four keccak bytes of the canonical signature", () => {
  assert.equal(SETTLE_SELECTOR, "ce5594a1");
});

test("settle calldata is deterministic and includes both signatures", () => {
  const maker = typedOrderFromTicket({
    maker: MAKER,
    side: "sell",
    quote: "USDC",
    sizeAtoms: 100_000_000n,
    priceTicks: 5291n,
    nonce: 1n,
    accountEpoch: 0n,
    tif: "GTC",
  });
  const taker = typedOrderFromTicket({
    maker: MAKER,
    side: "buy",
    quote: "USDC",
    sizeAtoms: 100_000_000n,
    priceTicks: 5300n,
    nonce: 2n,
    accountEpoch: 0n,
    tif: "IOC",
  });
  const first = encodeSettleCalldata(maker, SIG, taker, SIG, 1n);
  const second = encodeSettleCalldata(maker, SIG, taker, SIG, 1n);
  assert.equal(first, second);
  assert.equal(first.slice(2, 10), SETTLE_SELECTOR);
  assert.match(first, /0fd73c37f4362021fdd1693bdca85f8592eb338a7d62338504ba2cbaee2bb90f/);
  assert.notEqual(encodeSettleCalldata(maker, SIG, taker, SIG, 2n), first);
  assert.throws(() => encodeSettleCalldata(maker, "0x", taker, SIG, 1n), /65 bytes/);
  assert.throws(() => encodeSettleCalldata(maker, SIG, taker, SIG, 0n), /positive/);
  assert.throws(() => encodeSettleCalldata(maker, SIG, taker, SIG, 1n << 128n), /uint128/);
});
