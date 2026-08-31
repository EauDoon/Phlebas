import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  CLAIMED_EVENT_SIGNATURE,
  CLAIM_SELECTOR,
  FUNDED_EVENT_SIGNATURE,
  FUND_SELECTOR,
  LOCK_CREATED_EVENT_SIGNATURE,
  REFUNDED_EVENT_SIGNATURE,
  REFUND_SELECTOR,
  VERIFY_PREIMAGE_SELECTOR,
  encodeClaimCalldata,
  encodeConditionalLockConstructorArgs,
  encodeFundCalldata,
  encodeRefundCalldata,
  encodeVerifyPreimageCalldata,
  type ConditionalLockTerms,
} from "./conditional-lock-abi.ts";

const terms: ConditionalLockTerms = {
  swapId: `0x${"11".repeat(32)}`,
  termsHash: `0x${"22".repeat(32)}`,
  token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  funder: "0x1111111111111111111111111111111111111111",
  claimRecipient: "0x2222222222222222222222222222222222222222",
  refundRecipient: "0x1111111111111111111111111111111111111111",
  amount: 100_000_000n,
  hashlock: `0x${"33".repeat(32)}`,
  fundingCutoff: 1_900_000_000n,
  claimCutoff: 1_900_003_600n,
  refundTime: 1_900_007_200n,
};

test("function selectors match the Solidity ABI", () => {
  assert.equal(FUND_SELECTOR, "b60d4288");
  assert.equal(CLAIM_SELECTOR, "bd66528a");
  assert.equal(REFUND_SELECTOR, "590e1ae3");
  assert.equal(VERIFY_PREIMAGE_SELECTOR, "6ea8a0ca");
});

test("event signatures match the Solidity ABI", () => {
  assert.equal(
    LOCK_CREATED_EVENT_SIGNATURE,
    "ac651265f70c23b890ceac240cb11b0afa638867e02692e17e9947adbe5c0e9b",
  );
  assert.equal(
    FUNDED_EVENT_SIGNATURE,
    "72684aa74a58c3501fe65eec4ae1b61d5c12bcb5aae4b47ab0b56842b112f20b",
  );
  assert.equal(
    CLAIMED_EVENT_SIGNATURE,
    "0508a8b4117d9a7b3d8f5895f6413e61b4f9a2df35afbfb41e78d0ecfff1843f",
  );
  assert.equal(
    REFUNDED_EVENT_SIGNATURE,
    "f552ca82e113ac3c539c3d617f29fcd19c172a0c75dad017555c9e109f7fe183",
  );
});

test("constructor arguments encode all eleven immutable terms in order", () => {
  const encoded = encodeConditionalLockConstructorArgs(terms);
  assert.equal((encoded.length - 2) / 2, 11 * 32);
  assert.equal(encoded.slice(2, 66), "11".repeat(32));
  assert.equal(encoded.slice(66, 130), "22".repeat(32));
  assert.equal(
    encoded.slice(130, 194),
    "000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  );
  assert.equal(encoded.slice(450, 514), "33".repeat(32));
});

test("action encoders match the one-lock call shapes", () => {
  const preimage = `0x${"ab".repeat(32)}`;
  assert.equal(encodeFundCalldata(), `0x${FUND_SELECTOR}`);
  assert.equal(
    encodeClaimCalldata(preimage),
    `0x${CLAIM_SELECTOR}${"ab".repeat(32)}`,
  );
  assert.equal(encodeRefundCalldata(), `0x${REFUND_SELECTOR}`);
  assert.equal(
    encodeVerifyPreimageCalldata(preimage),
    `0x${VERIFY_PREIMAGE_SELECTOR}${"ab".repeat(32)}`,
  );
});

test("constructor encoding rejects terms the contract would reject", () => {
  assert.throws(() => encodeConditionalLockConstructorArgs({
    ...terms,
    swapId: `0x${"00".repeat(32)}`,
  }));
  assert.throws(() => encodeConditionalLockConstructorArgs({
    ...terms,
    amount: 0n,
  }));
  assert.throws(() => encodeConditionalLockConstructorArgs({
    ...terms,
    claimRecipient: terms.funder,
  }));
  assert.throws(() => encodeConditionalLockConstructorArgs({
    ...terms,
    refundRecipient: "0x3333333333333333333333333333333333333333",
  }));
  assert.throws(() => encodeConditionalLockConstructorArgs({
    ...terms,
    claimCutoff: terms.fundingCutoff,
  }));
});

test("encoders reject malformed fixed-width values", () => {
  assert.throws(() => encodeClaimCalldata(`0x${"11".repeat(31)}`));
  assert.throws(() => encodeClaimCalldata("11".repeat(32)));
  assert.throws(() => encodeConditionalLockConstructorArgs({
    ...terms,
    token: "0xnot-an-address",
  }));
  assert.throws(() => encodeConditionalLockConstructorArgs({
    ...terms,
    refundTime: 1n << 64n,
  }));
});
