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
    "78d7cf7804add8ba16e86edaba899f9ea37df1d536de8dd19091f5f09c035120",
  );
  assert.equal(settlementDigest(order), "23cf06d636047955c46b031bd1e5e788d74321da1c19d01ee562b2e194cdc4e9");
});
