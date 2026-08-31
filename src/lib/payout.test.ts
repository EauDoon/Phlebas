import assert from "node:assert/strict";
import test from "node:test";

import {
  attestPayout,
  broadcastPayoutClaim,
  closePayoutWithoutFinalizedBurn,
  confirmPayoutClaim,
  emptyPayoutLedger,
  finalizePayoutBurn,
  markPayoutPayable,
  markPayoutUnresolved,
  minePayoutClaim,
  observeUnresolvedTransaction,
  payoutClaimForTourStep,
  payoutClaimStubCopy,
  preparePayoutTransaction,
  refundPayoutBeforeSignature,
  rejectPayoutBeforeBurn,
  requestPayout,
  restoreUnresolvedInputs,
  screenPayout,
  screenPayoutClaim,
  signPayoutClaim,
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
  assert.equal(payoutClaimForTourStep("refunded", DEST).state, "refunded");
  assert.equal(payoutClaimForTourStep("transaction_prepared", DEST).state, "transaction_prepared");
  assert.equal(payoutClaimForTourStep("signed", DEST).state, "signed");
  assert.equal(payoutClaimForTourStep("broadcast", DEST).state, "broadcast");
  assert.equal(payoutClaimForTourStep("mined", DEST).state, "mined");
  assert.equal(payoutClaimForTourStep("confirmed", DEST).state, "confirmed");
  assert.equal(payoutClaimForTourStep("unresolved-observed", DEST).state, "broadcast");
  assert.equal(payoutClaimForTourStep("input-restored", DEST).state, "payable");
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

test("tour walker maps refunded through the pre-signature refund helper", () => {
  const payable = payoutClaimForTourStep("payable", DEST);
  const refunded = refundPayoutBeforeSignature(payable);
  assert.equal(refunded.state, "refunded");
  assert.match(refunded.reason ?? "", /Unrecoverable pre-signature failure/);
  assert.match(refunded.reason ?? "", /cancelled the unpaid claim/);
  assert.match(refunded.reason ?? "", /restored tZEC/);
  assert.match(refunded.reason ?? "", /Nothing is sent/);
  assert.equal(payoutClaimForTourStep("refunded", DEST).state, refunded.state);
  assert.equal(payoutClaimForTourStep("refunded", DEST).reason, refunded.reason);

  const finalized = payoutClaimForTourStep("burn finalized", DEST);
  assert.equal(refundPayoutBeforeSignature(finalized).state, "refunded");
  assert.equal(refundPayoutBeforeSignature(refunded).state, "refunded");
  assert.equal(signPayoutClaim(refunded).state, "rejected");
  assert.equal(refundPayoutBeforeSignature(payoutClaimForTourStep("screened", DEST)).state, "rejected");
  assert.equal(refundPayoutBeforeSignature(payoutClaimForTourStep("expired", DEST)).state, "rejected");

  const signed = signPayoutClaim(payable);
  assert.equal(signed.state, "signed");
  const afterSigned = refundPayoutBeforeSignature(signed);
  assert.equal(afterSigned.state, "rejected");
  assert.match(afterSigned.reason ?? "", /cannot be refunded/);
  assert.notEqual(afterSigned.state, "refunded");
});

test("happy-path walker uses prepare sign broadcast mine and confirm helpers", () => {
  const payable = payoutClaimForTourStep("payable", DEST);
  const prepared = preparePayoutTransaction(payable);
  assert.equal(prepared.state, "transaction_prepared");
  assert.equal(payoutClaimForTourStep("transaction_prepared", DEST).state, prepared.state);
  const signed = signPayoutClaim(prepared);
  assert.equal(signed.state, "signed");
  assert.equal(payoutClaimForTourStep("signed", DEST).state, signed.state);
  const broadcast = broadcastPayoutClaim(signed);
  assert.equal(broadcast.state, "broadcast");
  assert.equal(payoutClaimForTourStep("broadcast", DEST).state, broadcast.state);
  const mined = minePayoutClaim(broadcast);
  assert.equal(mined.state, "mined");
  assert.equal(payoutClaimForTourStep("mined", DEST).state, mined.state);
  const confirmed = confirmPayoutClaim(mined);
  assert.equal(confirmed.state, "confirmed");
  assert.equal(payoutClaimForTourStep("confirmed", DEST).state, confirmed.state);
  assert.equal(confirmPayoutClaim(payable).state, "rejected");
  assert.equal(broadcastPayoutClaim(payable).state, "rejected");
});

test("unresolved recovery helpers observe the committed tx or restore inputs", () => {
  const mined = payoutClaimForTourStep("mined", DEST);
  const unresolved = markPayoutUnresolved(mined);
  assert.equal(unresolved.state, "unresolved");
  assert.equal(payoutClaimForTourStep("unresolved", DEST).state, unresolved.state);

  const observed = observeUnresolvedTransaction(unresolved);
  assert.equal(observed.state, "broadcast");
  assert.match(observed.reason ?? "", /Exact committed transaction observed/);
  assert.match(observed.reason ?? "", /Nothing is sent/);
  assert.equal(payoutClaimForTourStep("unresolved-observed", DEST).state, observed.state);
  assert.equal(payoutClaimForTourStep("unresolved-observed", DEST).reason, observed.reason);

  const restored = restoreUnresolvedInputs(unresolved);
  assert.equal(restored.state, "payable");
  assert.match(restored.reason ?? "", /Verified input restoration/);
  assert.match(restored.reason ?? "", /Nothing is sent/);
  assert.equal(payoutClaimForTourStep("input-restored", DEST).state, restored.state);
  assert.equal(payoutClaimForTourStep("input-restored", DEST).reason, restored.reason);

  const payable = payoutClaimForTourStep("payable", DEST);
  assert.equal(observeUnresolvedTransaction(payable).state, "rejected");
  assert.equal(restoreUnresolvedInputs(payable).state, "rejected");
  assert.equal(markPayoutUnresolved(signPayoutClaim(payable)).state, "unresolved");
});

test("payoutClaimStubCopy surfaces walker claim state", () => {
  for (const id of withdrawalTourIds()) {
    const claim = payoutClaimForTourStep(id, DEST);
    assert.equal(payoutClaimStubCopy(claim), `Stub claim: ${claim.state}`);
  }
  assert.equal(payoutClaimStubCopy(payoutClaimForTourStep("requested", DEST)), "Stub claim: requested");
  assert.equal(payoutClaimStubCopy(payoutClaimForTourStep("screened", DEST)), "Stub claim: screened");
  assert.equal(payoutClaimStubCopy(payoutClaimForTourStep("rejected", DEST)), "Stub claim: rejected");
  assert.equal(payoutClaimStubCopy(payoutClaimForTourStep("burn submitted", DEST)), "Stub claim: burn-submitted");
  assert.equal(payoutClaimStubCopy(payoutClaimForTourStep("expired", DEST)), "Stub claim: closed");
  assert.equal(payoutClaimStubCopy(payoutClaimForTourStep("burn finalized", DEST)), "Stub claim: burn-finalized");
  assert.equal(payoutClaimStubCopy(payoutClaimForTourStep("payable", DEST)), "Stub claim: payable");
  assert.equal(payoutClaimStubCopy(payoutClaimForTourStep("transaction_prepared", DEST)), "Stub claim: transaction_prepared");
  assert.equal(payoutClaimStubCopy(payoutClaimForTourStep("signed", DEST)), "Stub claim: signed");
  assert.equal(payoutClaimStubCopy(payoutClaimForTourStep("broadcast", DEST)), "Stub claim: broadcast");
  assert.equal(payoutClaimStubCopy(payoutClaimForTourStep("mined", DEST)), "Stub claim: mined");
  assert.equal(payoutClaimStubCopy(payoutClaimForTourStep("confirmed", DEST)), "Stub claim: confirmed");
  assert.equal(payoutClaimStubCopy(payoutClaimForTourStep("refunded", DEST)), "Stub claim: refunded");
  assert.equal(payoutClaimStubCopy(payoutClaimForTourStep("unresolved", DEST)), "Stub claim: unresolved");
  assert.notEqual(payoutClaimStubCopy(payoutClaimForTourStep("signed", DEST)), "Stub claim: payable");
  assert.notEqual(payoutClaimStubCopy(payoutClaimForTourStep("broadcast", DEST)), "Stub claim: payable");
  assert.notEqual(payoutClaimStubCopy(payoutClaimForTourStep("mined", DEST)), "Stub claim: payable");
  assert.notEqual(payoutClaimStubCopy(payoutClaimForTourStep("confirmed", DEST)), "Stub claim: payable");
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
    if (id === "refunded") {
      assert.equal(claim.state, "refunded");
      assert.match(claim.reason ?? "", /Nothing is sent/);
      continue;
    }
    if (id === "unresolved") {
      assert.equal(claim.state, "unresolved");
      continue;
    }
    if (id === "unresolved-observed") {
      assert.equal(claim.state, "broadcast");
      assert.match(claim.reason ?? "", /Nothing is sent/);
      continue;
    }
    if (id === "input-restored") {
      assert.equal(claim.state, "payable");
      assert.match(claim.reason ?? "", /Nothing is sent/);
      continue;
    }
    if (id === "transaction_prepared") {
      assert.equal(claim.state, "transaction_prepared");
      continue;
    }
    if (id === "signed") {
      assert.equal(claim.state, "signed");
      continue;
    }
    if (id === "broadcast") {
      assert.equal(claim.state, "broadcast");
      continue;
    }
    if (id === "mined") {
      assert.equal(claim.state, "mined");
      continue;
    }
    if (id === "confirmed") {
      assert.equal(claim.state, "confirmed");
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
