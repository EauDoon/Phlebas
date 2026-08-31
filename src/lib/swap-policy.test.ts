import assert from "node:assert/strict";
import test from "node:test";

import { sampleSwapTerms } from "./swap-domain.test.ts";
import { assertSwapTimingPolicy, swapDeadlineStatus, type SwapTimingPolicy } from "./swap-policy.ts";

const fixturePolicy: SwapTimingPolicy = {
  minimumFundingWindowSeconds: 100n,
  minimumClaimWindowSeconds: 100n,
  minimumSafetyWindowSeconds: 500n,
};

test("requires strict funding, claim, and refund ordering", () => {
  assert.deepEqual(assertSwapTimingPolicy(sampleSwapTerms, fixturePolicy), sampleSwapTerms);
  assert.throws(
    () => assertSwapTimingPolicy({ ...sampleSwapTerms, evmRefundTime: sampleSwapTerms.evmClaimSafetyCutoff }, fixturePolicy),
    /strictly increasing/,
  );
  assert.throws(
    () => assertSwapTimingPolicy({ ...sampleSwapTerms, evmRefundTime: sampleSwapTerms.evmClaimSafetyCutoff + 99n }, fixturePolicy),
    /claim window/,
  );
  assert.throws(
    () => assertSwapTimingPolicy({ ...sampleSwapTerms, zecRefundTime: sampleSwapTerms.evmRefundTime + 499n }, fixturePolicy),
    /safety window/,
  );
});

test("derives deadline eligibility without turning it into journal evidence", () => {
  assert.deepEqual(swapDeadlineStatus(sampleSwapTerms, sampleSwapTerms.authorizationDeadline - 1n), {
    authorizationOpen: true,
    zecFundingOpen: true,
    evmFundingOpen: true,
    evmClaimSafe: true,
    evmRefundEligible: false,
    zecRefundEligible: false,
  });
  assert.deepEqual(swapDeadlineStatus(sampleSwapTerms, sampleSwapTerms.evmRefundTime), {
    authorizationOpen: false,
    zecFundingOpen: false,
    evmFundingOpen: false,
    evmClaimSafe: false,
    evmRefundEligible: true,
    zecRefundEligible: false,
  });
  assert.equal(swapDeadlineStatus(sampleSwapTerms, sampleSwapTerms.zecRefundTime).zecRefundEligible, true);
});

test("rejects invalid policy values and non-integer chain time", () => {
  assert.throws(
    () => assertSwapTimingPolicy(sampleSwapTerms, { ...fixturePolicy, minimumSafetyWindowSeconds: 0n }),
    /positive uint64/,
  );
  assert.throws(() => swapDeadlineStatus(sampleSwapTerms, 1.5 as unknown as bigint), /bigint/);
  assert.throws(() => swapDeadlineStatus(sampleSwapTerms, -1n), /uint64/);
});
