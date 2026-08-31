import assert from "node:assert/strict";
import test from "node:test";

import {
  createZip317TransparentPolicy,
  planTransparentChange,
  validateTransparentFee,
  zip317TransparentConventionalFee,
} from "./zcash-fees.ts";

const POLICY = createZip317TransparentPolicy({
  maximumFeeZatoshis: 50_000n,
  minimumOutputZatoshis: 1_000n,
  maximumTransactionBytes: 100_000,
});

test("ZIP 317 transparent fee uses exact byte ceilings and two grace actions", () => {
  assert.equal(zip317TransparentConventionalFee({ inputBytes: 149, outputBytes: 33 }), 10_000n);
  assert.equal(zip317TransparentConventionalFee({ inputBytes: 150, outputBytes: 34 }), 10_000n);
  assert.equal(zip317TransparentConventionalFee({ inputBytes: 300, outputBytes: 68 }), 10_000n);
  assert.equal(zip317TransparentConventionalFee({ inputBytes: 301, outputBytes: 68 }), 15_000n);
  assert.equal(zip317TransparentConventionalFee({ inputBytes: 150, outputBytes: 69 }), 15_000n);
});

test("fee policy distinguishes conventional wallet policy from explicit caps", () => {
  assert.equal(POLICY.id, "zip317-transparent-r0-r1");
  assert.doesNotThrow(() => validateTransparentFee(POLICY, { inputBytes: 300, outputBytes: 68 }, 10_000n));
  assert.throws(
    () => validateTransparentFee(POLICY, { inputBytes: 301, outputBytes: 68 }, 10_000n),
    /below the configured conventional fee/,
  );
  assert.throws(
    () => validateTransparentFee(POLICY, { inputBytes: 150, outputBytes: 34 }, 50_001n),
    /approved maximum/,
  );
  assert.throws(
    () => validateTransparentFee(POLICY, { inputBytes: 100_000, outputBytes: 1 }, 50_000n),
    /configured size limit/,
  );
});

test("change planning preserves the exact value equation", () => {
  assert.deepEqual(planTransparentChange({
    policy: POLICY,
    inputTotalZatoshis: 1_020_000n,
    fixedOutputTotalZatoshis: 1_000_000n,
    feeZatoshis: 10_000n,
    finalizedSizeWithoutChange: { inputBytes: 150, outputBytes: 32 },
    finalizedSizeWithChange: { inputBytes: 150, outputBytes: 66 },
    belowMinimum: "reject",
  }), { disposition: "change", feeZatoshis: 10_000n, changeZatoshis: 10_000n });

  assert.deepEqual(planTransparentChange({
    policy: POLICY,
    inputTotalZatoshis: 1_010_000n,
    fixedOutputTotalZatoshis: 1_000_000n,
    feeZatoshis: 10_000n,
    finalizedSizeWithoutChange: { inputBytes: 150, outputBytes: 32 },
    finalizedSizeWithChange: { inputBytes: 150, outputBytes: 66 },
    belowMinimum: "reject",
  }), { disposition: "none", feeZatoshis: 10_000n, changeZatoshis: 0n });
});

test("sub-minimum change is rejected or explicitly added to the fee", () => {
  const options = {
    policy: POLICY,
    inputTotalZatoshis: 1_010_500n,
    fixedOutputTotalZatoshis: 1_000_000n,
    feeZatoshis: 10_000n,
    finalizedSizeWithoutChange: { inputBytes: 150, outputBytes: 32 },
    finalizedSizeWithChange: { inputBytes: 150, outputBytes: 66 },
  } as const;
  assert.throws(() => planTransparentChange({ ...options, belowMinimum: "reject" }), /cannot be omitted silently/);
  assert.deepEqual(planTransparentChange({ ...options, belowMinimum: "add-to-fee" }), {
    disposition: "add-to-fee",
    feeZatoshis: 10_500n,
    changeZatoshis: 0n,
  });
});

test("fee and change policy rejects malformed values and overdraw", () => {
  assert.throws(() => zip317TransparentConventionalFee({ inputBytes: 0, outputBytes: 34 }), /positive safe integer/);
  assert.throws(() => createZip317TransparentPolicy({
    maximumFeeZatoshis: 0n,
    minimumOutputZatoshis: 1n,
    maximumTransactionBytes: 1,
  }), /Maximum fee/);
  assert.throws(
    () => zip317TransparentConventionalFee({ inputBytes: Number.MAX_SAFE_INTEGER, outputBytes: 34 }),
    /supply bound/,
  );
  assert.throws(() => planTransparentChange({
    policy: POLICY,
    inputTotalZatoshis: 1_000_000n,
    fixedOutputTotalZatoshis: 1_000_000n,
    feeZatoshis: 10_000n,
    finalizedSizeWithoutChange: { inputBytes: 150, outputBytes: 32 },
    finalizedSizeWithChange: { inputBytes: 150, outputBytes: 66 },
    belowMinimum: "reject",
  }), /do not cover/);
});
