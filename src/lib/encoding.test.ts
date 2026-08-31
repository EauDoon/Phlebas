import assert from "node:assert/strict";
import test from "node:test";

import { digestCanonicalOrder, encodeCanonicalOrder, type CanonicalOrder } from "./encoding.ts";

const sample: CanonicalOrder = {
  maker: "session",
  side: "buy",
  baseAsset: "pZEC",
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
  assert.match(encoded, /\nverifyingContract=not-deployed$/);
  assert.equal(encodeCanonicalOrder(sample), encoded);
});

test("digest is deterministic and 64 hex characters", async () => {
  const digest = await digestCanonicalOrder(sample);
  assert.equal(digest, await digestCanonicalOrder(sample));
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.notEqual(digest, await digestCanonicalOrder({ ...sample, nonce: "2" }));
});

test("allowed venues are part of the canonical encoding", () => {
  assert.match(encodeCanonicalOrder(sample), /\nallowedVenues=clob\n/);
  assert.match(
    encodeCanonicalOrder({ ...sample, allowedVenues: "clob,amm" }),
    /\nallowedVenues=clob,amm\n/,
  );
});
