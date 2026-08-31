import assert from "node:assert/strict";
import test from "node:test";

import { hashOrder } from "./eip712.ts";
import { bytesToHex } from "./keccak.ts";
import { settlementDigest, typedOrderFromTicket } from "./ticket-order.ts";

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
    "7dec6a8eea90d206d60f03afeb1576724c542c1f118535c875003e6719c6c334",
  );
  assert.equal(settlementDigest(order), "eed61ef0af305769d9791ea9cb3a6cf587afa1e8acc3c81108e692e4900c8c1a");
});
