import assert from "node:assert/strict";
import test from "node:test";

import {
  ARBITRUM_SEPOLIA_CHAIN_ID,
  EIP712_DOMAIN_TYPEHASH,
  ORDER_TYPE,
  ORDER_TYPEHASH,
  eip712DigestHex,
  hashDomain,
  hashOrder,
  sepoliaDomain,
  typedData,
  timeInForceCode,
  venuesBitmask,
  type TypedOrder,
} from "./eip712.ts";
import { bytesToHex } from "./keccak.ts";

const ZERO = "0x0000000000000000000000000000000000000000";
const MAKER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const BASE = "0x0000000000000000000000000000000000000001";
const QUOTE = "0x0000000000000000000000000000000000000002";

const sample: TypedOrder = {
  maker: MAKER,
  side: 0,
  baseAsset: BASE,
  quoteAsset: QUOTE,
  baseAmount: 100_000_000n,
  limitPriceTicks: 5291n,
  timeInForce: 0,
  nonce: 1n,
  accountEpoch: 0n,
  expiry: 0n,
  salt: 1n,
  recipient: MAKER,
  maximumFeeBps: 30,
  allowedVenues: 1,
};

test("EIP-712 typehashes are keccak of the canonical type strings", () => {
  assert.equal(EIP712_DOMAIN_TYPEHASH, "8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f");
  assert.equal(ORDER_TYPEHASH, "59d262d3dfbfd89c25b7ee0d870e5189eeea097456890c5d4769de7efefef4e8");
  assert.match(ORDER_TYPE, /^Order\(/);
});

test("Sepolia domain binds name, version, chain, and verifying contract", () => {
  const domain = sepoliaDomain(ZERO);
  assert.equal(domain.chainId, ARBITRUM_SEPOLIA_CHAIN_ID);
  assert.equal(domain.name, "PhlebasSettlement");
  assert.equal(domain.version, "1");
  const hash = bytesToHex(hashDomain(domain));
  assert.notEqual(hash, bytesToHex(hashDomain({ ...domain, chainId: 42161n })));
  assert.notEqual(hash, bytesToHex(hashDomain({ ...domain, verifyingContract: MAKER })));
});

test("order digest is deterministic and changes with nonce", () => {
  const domain = sepoliaDomain(ZERO);
  const digest = eip712DigestHex(domain, sample);
  assert.equal(digest, eip712DigestHex(domain, sample));
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.notEqual(digest, eip712DigestHex(domain, { ...sample, nonce: 2n }));
  assert.equal(digest, "23cf06d636047955c46b031bd1e5e788d74321da1c19d01ee562b2e194cdc4e9");
  assert.equal(bytesToHex(hashOrder(sample)), "78d7cf7804add8ba16e86edaba899f9ea37df1d536de8dd19091f5f09c035120");
});

test("wallet typed data carries the same fields as the Solidity order", () => {
  const payload = typedData(sepoliaDomain(ZERO), sample);
  assert.equal(payload.primaryType, "Order");
  assert.equal(payload.domain.chainId, ARBITRUM_SEPOLIA_CHAIN_ID.toString());
  assert.equal(payload.message.side, 0);
  assert.equal(payload.message.baseAmount, "100000000");
  assert.equal(payload.message.timeInForce, 0);
  assert.equal(venuesBitmask("clob,amm"), 3);
  assert.equal(timeInForceCode("FOK"), 2);
});

test("rejects over-cap fees and malformed addresses", () => {
  const domain = sepoliaDomain(ZERO);
  assert.throws(() => eip712DigestHex(domain, { ...sample, maximumFeeBps: 31 }), /30/);
  assert.throws(() => sepoliaDomain("not-an-address"), /address/);
  assert.throws(() => typedData(domain, { ...sample, nonce: 1n << 64n }), /uint64/);
});

test("rejects values that Solidity cannot encode into the declared integer widths", () => {
  const domain = sepoliaDomain(ZERO);
  assert.throws(() => eip712DigestHex(domain, { ...sample, baseAmount: 1n << 128n }), /uint128/);
  assert.throws(() => eip712DigestHex(domain, { ...sample, nonce: 1n << 64n }), /uint64/);
  assert.throws(() => eip712DigestHex(domain, { ...sample, expiry: -1n }), /uint64/);
  assert.throws(() => eip712DigestHex(domain, { ...sample, baseAmount: 0n }), /positive/);
  assert.throws(() => eip712DigestHex(domain, { ...sample, maximumFeeBps: 1.5 }), /30/);
  assert.throws(() => eip712DigestHex(domain, { ...sample, timeInForce: 3 as 0 }), /timeInForce/);
});
