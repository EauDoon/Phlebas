// Pins the lock ABI as seen by the browser to the Solidity contract. Any
// change to the function or event signatures in the contract must update the
// selectors here and the contract in lockstep. Run with `node --test`.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  CLAIM_EVENT_SIGNATURE,
  CLAIM_SELECTOR,
  DEPOSIT_EVENT_SIGNATURE,
  DEPOSIT_SELECTOR,
  PAUSE_SELECTOR,
  PAUSE_SET_EVENT_SIGNATURE,
  REFUND_EVENT_SIGNATURE,
  REFUND_SELECTOR,
  UNPAUSE_SELECTOR,
  encodeClaimCalldata,
  encodeDepositCalldata,
  encodePauseCalldata,
  encodeRefundCalldata,
  encodeUnpauseCalldata,
  type LockParams,
} from "./conditional-lock-abi.ts";

test("deposit selector matches Solidity keccak", () => {
  assert.equal(DEPOSIT_SELECTOR, "7402f10a");
});

test("claim selector matches Solidity keccak", () => {
  assert.equal(CLAIM_SELECTOR, "31d14457");
});

test("refund selector matches Solidity keccak", () => {
  assert.equal(REFUND_SELECTOR, "278ecde1");
});

test("pause selector matches Solidity keccak", () => {
  assert.equal(PAUSE_SELECTOR, "8456cb59");
});

test("unpause selector matches Solidity keccak", () => {
  assert.equal(UNPAUSE_SELECTOR, "3f4ba83a");
});

test("event signatures pin the contract ABI", () => {
  assert.equal(
    DEPOSIT_EVENT_SIGNATURE,
    "783edc607a76ed51cbc26c67a7f167e74218a61b9a0f34c701bc8e204d36b49b",
  );
  assert.equal(
    CLAIM_EVENT_SIGNATURE,
    "4ec90e965519d92681267467f775ada5bd214aa92c0dc93d90a5e880ce9ed026",
  );
  assert.equal(
    REFUND_EVENT_SIGNATURE,
    "7ca5472b7ea78c2c0141c5a12ee6d170cf4ce8ed06be3d22c8252ddfc7a6a2c4",
  );
  assert.equal(
    PAUSE_SET_EVENT_SIGNATURE,
    "878ac8a2ca79520471f8f3c8494fa802c03ce3bf034252aad7f22318984fdbdb",
  );
});

test("encodeDepositCalldata produces 4 + 6*32 byte payload", () => {
  const params: LockParams = {
    token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    amount: 100_000_000n,
    hashlock: "0x5b20697604703c31c910b528899cfcd8fc4b623c0582032d0fa8fb854ed48017",
    refundAfter: 1_900_000_000n,
    refundTo: "0x1111111111111111111111111111111111111111",
    claimTo: "0x2222222222222222222222222222222222222222",
  };
  const data = encodeDepositCalldata(params);
  assert.equal(data.slice(2, 10), DEPOSIT_SELECTOR);
  const payloadLen = (data.length - 2) / 2 - 4;
  assert.equal(payloadLen, 6 * 32);
});

test("encodeClaimCalldata prepends selector and packs lockId and preimage", () => {
  const data = encodeClaimCalldata(
    7n,
    "0x0000000000000000000000000000000000000000000000000000000000c0ffee",
  );
  assert.equal(data.slice(2, 10), CLAIM_SELECTOR);
  assert.equal(data.length, 2 + 4 * 2 + 64 * 2);
});

test("encodeRefundCalldata prepends selector and packs lockId", () => {
  const data = encodeRefundCalldata(7n);
  assert.equal(data.slice(2, 10), REFUND_SELECTOR);
  assert.equal(data.length, 2 + 4 * 2 + 32 * 2);
});

test("encodePauseCalldata and encodeUnpauseCalldata are selector-only", () => {
  assert.equal(encodePauseCalldata(), `0x${PAUSE_SELECTOR}`);
  assert.equal(encodeUnpauseCalldata(), `0x${UNPAUSE_SELECTOR}`);
});

test("encodeClaimCalldata rejects zero or negative lockId", () => {
  assert.throws(() => encodeClaimCalldata(0n, "0x" + "00".repeat(32)));
  assert.throws(() => encodeClaimCalldata(-1n, "0x" + "00".repeat(32)));
  assert.throws(() => encodeRefundCalldata(0n));
});

test("encodeDepositCalldata rejects malformed fields", () => {
  const base: LockParams = {
    token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    amount: 1n,
    hashlock: "0x" + "11".repeat(32),
    refundAfter: 1n,
    refundTo: "0x1111111111111111111111111111111111111111",
    claimTo: "0x2222222222222222222222222222222222222222",
  };
  assert.throws(() => encodeDepositCalldata({ ...base, token: "0xnope" }));
  assert.throws(() => encodeDepositCalldata({ ...base, refundTo: "0x" }));
  assert.throws(() => encodeDepositCalldata({ ...base, hashlock: "0x" + "11".repeat(31) }));
});
