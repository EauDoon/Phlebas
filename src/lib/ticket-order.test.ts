import assert from "node:assert/strict";
import test from "node:test";

import { hashOrder } from "./eip712.ts";
import { bytesToHex } from "./keccak.ts";
import { parseExpiryUnix, settlementDigest, typedOrderFromTicket } from "./ticket-order.ts";

const MAKER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

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
  assert.equal(order.baseAsset, "0x0000000000000000000000000000000000000001");
  assert.equal(
    bytesToHex(hashOrder(order)),
    "78d7cf7804add8ba16e86edaba899f9ea37df1d536de8dd19091f5f09c035120",
  );
  assert.equal(settlementDigest(order), "23cf06d636047955c46b031bd1e5e788d74321da1c19d01ee562b2e194cdc4e9");
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
