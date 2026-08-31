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
  assert.equal(ORDER_TYPEHASH, "500d62235725032be08d01f5a4aa11a96e771d40267bdf234cbf9dc51399cc24");
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
  assert.equal(digest, "eed61ef0af305769d9791ea9cb3a6cf587afa1e8acc3c81108e692e4900c8c1a");
  assert.equal(bytesToHex(hashOrder(sample)), "7dec6a8eea90d206d60f03afeb1576724c542c1f118535c875003e6719c6c334");
});

test("wallet typed data carries the same fields as the Solidity order", () => {
  const payload = typedData(sepoliaDomain(ZERO), sample);
  assert.equal(payload.primaryType, "Order");
  assert.equal(payload.domain.chainId, Number(ARBITRUM_SEPOLIA_CHAIN_ID));
  assert.equal(payload.message.side, 0);
  assert.equal(payload.message.baseAmount, "100000000");
  assert.equal(venuesBitmask("clob,amm"), 3);
});

test("rejects over-cap fees and malformed addresses", () => {
  const domain = sepoliaDomain(ZERO);
  assert.throws(() => eip712DigestHex(domain, { ...sample, maximumFeeBps: 31 }), /30/);
  assert.throws(() => sepoliaDomain("not-an-address"), /address/);
});
