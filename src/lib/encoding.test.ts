import assert from "node:assert/strict";
import test from "node:test";

import { digestCanonicalOrder, encodeCanonicalOrder, type CanonicalOrder } from "./encoding.ts";

const sample: CanonicalOrder = {
  maker: "session",
  side: "buy",
  baseAsset: "ZEC",
  quoteAsset: "USDC",
  baseAmountAtoms: "100000000",
  limitPriceTicks: "5291",
  nonce: "1",
  accountEpoch: "0",
  expiry: "0",
  salt: "1",
  recipient: "session",
  maximumFeeBps: "30",
  allowedVenues: "clob",
  chainId: "42161",
  verifyingContract: "not-deployed",
};

test("canonical encoding is field-order stable", () => {
  const encoded = encodeCanonicalOrder(sample);
  assert.match(encoded, /^maker=session\nside=buy\n/);
  assert.match(encoded, /\nbaseAsset=ZEC\n/);
  assert.doesNotMatch(encoded, /pZEC/);
  assert.match(encoded, /\nverifyingContract=not-deployed$/);
  assert.equal(encodeCanonicalOrder(sample), encoded);
});

test("digest is deterministic and 64 hex characters", async () => {
  const digest = await digestCanonicalOrder(sample);
  assert.equal(digest, await digestCanonicalOrder(sample));
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.notEqual(digest, await digestCanonicalOrder({ ...sample, nonce: "2" }));
});

test("frozen SHA-256 vector for baseAsset ZEC", async () => {
  assert.equal(encodeCanonicalOrder(sample), [
    "maker=session",
    "side=buy",
    "baseAsset=ZEC",
    "quoteAsset=USDC",
    "baseAmountAtoms=100000000",
    "limitPriceTicks=5291",
    "nonce=1",
    "accountEpoch=0",
    "expiry=0",
    "salt=1",
    "recipient=session",
    "maximumFeeBps=30",
    "allowedVenues=clob",
    "chainId=42161",
    "verifyingContract=not-deployed",
  ].join("\n"));
  assert.equal(
    await digestCanonicalOrder(sample),
    "2d3360d350d50a83e69a46f50a4fedcfc77a610dc91fe0d80fee67616acb38ca",
  );
});

test("canonical digest changes when expiry is not none", async () => {
  const none = await digestCanonicalOrder(sample);
  const expiring = await digestCanonicalOrder({ ...sample, expiry: "1700000000" });
  assert.match(encodeCanonicalOrder({ ...sample, expiry: "1700000000" }), /\nexpiry=1700000000\n/);
  assert.notEqual(none, expiring);
});

test("allowed venues are part of the canonical encoding", () => {
  assert.match(encodeCanonicalOrder(sample), /\nallowedVenues=clob\n/);
  assert.match(
    encodeCanonicalOrder({ ...sample, allowedVenues: "clob,amm" }),
    /\nallowedVenues=clob,amm\n/,
  );
});
