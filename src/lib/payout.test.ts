import assert from "node:assert/strict";
import test from "node:test";

import {
  attestPayout,
  closePayoutWithoutFinalizedBurn,
  emptyPayoutLedger,
  finalizePayoutBurn,
  markPayoutPayable,
  markPayoutUnresolved,
  payoutClaimForTourStep,
  rejectPayoutBeforeBurn,
  requestPayout,
  screenPayout,
  screenPayoutClaim,
  submitPayoutBurn,
} from "./payout.ts";
import { withdrawalTourIds } from "./withdrawal-tour.ts";

const DEST = "t1Zo4ZzPXJiJ8M8pYMgL4tWbdkH7c8r7abc";

test("one burn authorizes at most one transparent payout", () => {
  const spent = emptyPayoutLedger();
  const first = attestPayout({ burnId: "burn-1", destination: DEST, amountZatoshis: 100n }, spent);
  assert.equal(first.status, "eligible");
  if (first.status === "eligible") {
    assert.equal(first.amountZatoshis, "100");
    assert.equal(first.destination, DEST);
  }
  const second = attestPayout({ burnId: "burn-1", destination: DEST, amountZatoshis: 100n }, spent);
  assert.equal(second.status, "rejected");
  assert.match(second.reason, /already authorized/);
});

test("shielded, TEX, and empty destinations cannot create a payout", () => {
  const spent = emptyPayoutLedger();
  assert.equal(attestPayout({ burnId: "b1", destination: "zs1notreal", amountZatoshis: 1n }, spent).status, "rejected");
  assert.equal(attestPayout({ burnId: "b2", destination: "tex1short", amountZatoshis: 1n }, spent).status, "rejected");
  assert.equal(attestPayout({ burnId: "b3", destination: "", amountZatoshis: 1n }, spent).status, "rejected");
  assert.equal(spent.size, 0);
});

test("pre-burn screen rejects shielded and TEX destinations without a burn", () => {
  const screened = screenPayout(DEST, 1n);
  assert.equal(screened.state, "screened");
  assert.equal(screenPayout("zs1notreal", 1n).state, "rejected");
  assert.equal(screenPayout("tex1short", 1n).state, "rejected");
  assert.equal(screenPayout(DEST, 0n).state, "rejected");
});

test("invalid burn id and non-positive amount cannot create a payout", () => {
  const spent = emptyPayoutLedger();
  assert.equal(attestPayout({ burnId: "", destination: DEST, amountZatoshis: 1n }, spent).status, "rejected");
  assert.equal(attestPayout({ burnId: "bad id!", destination: DEST, amountZatoshis: 1n }, spent).status, "rejected");
  assert.equal(attestPayout({ burnId: "ok", destination: DEST, amountZatoshis: 0n }, spent).status, "rejected");
  assert.equal(attestPayout({ burnId: "ok", destination: DEST, amountZatoshis: -1n }, spent).status, "rejected");
  assert.equal(spent.size, 0);
});

test("payout claim walks requested, screened, burn-submitted, payable and never sends", () => {
  const spent = emptyPayoutLedger();
  const requested = requestPayout({ burnId: "burn-2", destination: DEST, amountZatoshis: 50n });
  assert.equal(requested.state, "requested");
  const screened = screenPayoutClaim(requested);
  assert.equal(screened.state, "screened");
  assert.equal(submitPayoutBurn(requested, spent).state, "rejected");
  const submitted = submitPayoutBurn(screened, spent);
  assert.equal(submitted.state, "burn-submitted");
  assert.equal(spent.size, 1);
  assert.equal(markPayoutPayable(submitted).state, "rejected");
  const finalized = finalizePayoutBurn(submitted);
  assert.equal(finalized.state, "burn-finalized");
  const payable = markPayoutPayable(finalized);
  assert.equal(payable.state, "payable");
  assert.equal(markPayoutUnresolved(payable).state, "unresolved");
  assert.equal(submitPayoutBurn(screened, spent).state, "rejected");
});

test("tour step walker reaches payable only after a screened transparent destination", () => {
  assert.equal(payoutClaimForTourStep("requested", DEST).state, "requested");
  assert.equal(payoutClaimForTourStep("screened", DEST).state, "screened");
  assert.equal(payoutClaimForTourStep("burn submitted", DEST).state, "burn-submitted");
  assert.equal(payoutClaimForTourStep("expired", DEST).state, "closed");
  assert.equal(payoutClaimForTourStep("burn finalized", DEST).state, "burn-finalized");
  assert.equal(payoutClaimForTourStep("payable", DEST).state, "payable");
  assert.equal(payoutClaimForTourStep("confirmed", DEST).state, "payable");
  assert.equal(payoutClaimForTourStep("screened", "zs1notreal").state, "rejected");
  assert.equal(payoutClaimForTourStep("payable", "").state, "rejected");
});

test("tour walker maps rejected and unresolved through the payout helpers", () => {
  const screened = screenPayoutClaim(requestPayout({
    burnId: "tour-preview",
    destination: DEST,
    amountZatoshis: 1n,
  }));
  const rejected = rejectPayoutBeforeBurn(screened);
  assert.equal(rejected.state, "rejected");
  assert.match(rejected.reason ?? "", /Nothing was burned/);
  assert.equal(payoutClaimForTourStep("rejected", DEST).state, rejected.state);
  assert.equal(payoutClaimForTourStep("rejected", DEST).reason, rejected.reason);

  const payable = payoutClaimForTourStep("payable", DEST);
  const unresolved = markPayoutUnresolved(payable);
  assert.equal(unresolved.state, "unresolved");
  assert.match(unresolved.reason ?? "", /stale/);
  assert.equal(payoutClaimForTourStep("unresolved", DEST).state, unresolved.state);
  assert.equal(payoutClaimForTourStep("unresolved", DEST).reason, unresolved.reason);
  assert.equal(rejectPayoutBeforeBurn(payable).state, "rejected");
});

test("tour walker maps expired evidence through close without a finalized burn", () => {
  const spent = emptyPayoutLedger();
  const submitted = submitPayoutBurn(screenPayoutClaim(requestPayout({
    burnId: "tour-preview",
    destination: DEST,
    amountZatoshis: 1n,
  })), spent);
  const closed = closePayoutWithoutFinalizedBurn(submitted);
  assert.equal(closed.state, "closed");
  assert.match(closed.reason ?? "", /Closed without a finalized burn/);
  assert.equal(payoutClaimForTourStep("expired", DEST).state, closed.state);
  assert.equal(payoutClaimForTourStep("expired", DEST).reason, closed.reason);
  assert.equal(closePayoutWithoutFinalizedBurn(closed).state, "closed");
  assert.equal(closePayoutWithoutFinalizedBurn(payoutClaimForTourStep("payable", DEST)).state, "rejected");
  assert.equal(finalizePayoutBurn(closed).state, "rejected");
});

test("every withdrawal tour id walks through payoutClaimForTourStep without sending", () => {
  for (const id of withdrawalTourIds()) {
    const claim = payoutClaimForTourStep(id, DEST);
    if (id === "rejected") {
      assert.equal(claim.state, "rejected");
      assert.match(claim.reason ?? "", /before burn/);
      continue;
    }
    if (id === "expired") {
      assert.equal(claim.state, "closed");
      assert.match(claim.reason ?? "", /Closed without a finalized burn/);
      continue;
    }
    if (id === "unresolved") {
      assert.equal(claim.state, "unresolved");
      continue;
    }
    assert.notEqual(claim.state, "rejected");
  }
});

test("shielded request is rejected at screen and does not spend a burn", () => {
  const spent = emptyPayoutLedger();
  const screened = screenPayoutClaim(requestPayout({
    burnId: "burn-3",
    destination: "zs1notreal",
    amountZatoshis: 1n,
  }));
  assert.equal(screened.state, "rejected");
  assert.equal(submitPayoutBurn(screened, spent).state, "rejected");
  assert.equal(spent.size, 0);
  assert.equal(markPayoutPayable(requestPayout({
    burnId: "burn-3",
    destination: DEST,
    amountZatoshis: 1n,
  })).state, "rejected");
});
