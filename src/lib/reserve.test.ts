import assert from "node:assert/strict";
import test from "node:test";

import {
  applyVerifiedInputRestoration,
  applyVerifiedTransactionObservation,
  broadcastWithdrawal,
  calculateReserveCoverage,
  confirmWithdrawal,
  markWithdrawalMined,
  markWithdrawalUnresolved,
  signWithdrawal,
  type ReserveCoverageState,
  type WithdrawalClaim,
} from "./reserve.ts";

const TX_ID = "a".repeat(64);
const OTHER_TX_ID = "b".repeat(64);

const payableClaim = (claimId = "wd-1", payable = 100n): WithdrawalClaim => ({
  claimId,
  transactionId: "",
  payable,
  status: "payable",
  selectedInput: 0n,
  inTransitPrincipal: 0n,
  inFlightChange: 0n,
  networkFee: 0n,
});

const burnedState: ReserveCoverageState = {
  controlledAssets: 1011n,
  tokenSupply: 900n,
  depositEntitlements: 0n,
  withdrawalClaims: [payableClaim()],
  committedTransactionIds: [],
  otherLiabilities: 0n,
  requiredBuffer: 10n,
};

test("keeps an exactly selected withdrawal covered through broadcast, mined, and confirmed", () => {
  const signed = signWithdrawal(burnedState, {
    claimId: "wd-1",
    transactionId: TX_ID,
    selectedInput: 101n,
    principal: 100n,
    inFlightChange: 0n,
    networkFee: 1n,
  });
  const broadcast = broadcastWithdrawal(signed, "wd-1");
  const mined = markWithdrawalMined(broadcast, "wd-1");
  const confirmed = confirmWithdrawal(mined, "wd-1");

  assert.equal(broadcast.controlledAssets, 910n);
  assert.equal(calculateReserveCoverage(broadcast).inTransitPrincipal, 100n);
  assert.equal(mined.withdrawalClaims[0]?.status, "mined");
  assert.equal(confirmed.controlledAssets, 910n);
  assert.equal(confirmed.withdrawalClaims.length, 0);
  assert.deepEqual(confirmed.committedTransactionIds, [TX_ID]);
  assert.equal(calculateReserveCoverage(confirmed).controlledCovered, true);
});

test("excludes in-flight change from solvency until it confirms", () => {
  assert.throws(
    () =>
      signWithdrawal(burnedState, {
        claimId: "wd-1",
        transactionId: TX_ID,
        selectedInput: 201n,
        principal: 100n,
        inFlightChange: 100n,
        networkFee: 1n,
      }),
    /coverage would be insufficient/,
  );

  const funded: ReserveCoverageState = { ...burnedState, controlledAssets: 1111n };
  const signed = signWithdrawal(funded, {
    claimId: "wd-1",
    transactionId: TX_ID,
    selectedInput: 201n,
    principal: 100n,
    inFlightChange: 100n,
    networkFee: 1n,
  });
  const broadcast = broadcastWithdrawal(signed, "wd-1");
  const coverage = calculateReserveCoverage(broadcast);
  assert.equal(broadcast.controlledAssets, 910n);
  assert.equal(coverage.inFlightChange, 100n);
  assert.equal(coverage.controlledCovered, true);
  assert.equal(coverage.totalCovered, true);

  const confirmed = confirmWithdrawal(markWithdrawalMined(broadcast, "wd-1"), "wd-1");
  assert.equal(confirmed.controlledAssets, 1010n);
});

test("restores the full selected input only after independent spendability proof", () => {
  const signed = signWithdrawal(burnedState, {
    claimId: "wd-1",
    transactionId: TX_ID,
    selectedInput: 101n,
    principal: 100n,
    inFlightChange: 0n,
    networkFee: 1n,
  });
  const broadcast = broadcastWithdrawal(signed, "wd-1");
  const unresolved = markWithdrawalUnresolved(markWithdrawalMined(broadcast, "wd-1"), "wd-1");
  const restored = applyVerifiedInputRestoration(unresolved, {
    claimId: "wd-1",
    transactionId: TX_ID,
    selectedInput: 101n,
    evidenceReference: "recovery:wd-1:proof-1",
    inputsSpendable: true,
    transactionCannotConfirm: true,
  });

  assert.equal(restored.controlledAssets, 1011n);
  assert.deepEqual(restored.withdrawalClaims, [payableClaim()]);
});

test("removes an ambiguous transaction from coverage and forces an incident halt", () => {
  const signed = signWithdrawal(burnedState, {
    claimId: "wd-1",
    transactionId: TX_ID,
    selectedInput: 101n,
    principal: 100n,
    inFlightChange: 0n,
    networkFee: 1n,
  });
  const unresolved = markWithdrawalUnresolved(broadcastWithdrawal(signed, "wd-1"), "wd-1");
  const coverage = calculateReserveCoverage(unresolved);

  assert.equal(unresolved.withdrawalClaims[0]?.inTransitPrincipal, 0n);
  assert.equal(unresolved.controlledAssets, 910n);
  assert.equal(coverage.unresolvedPrincipal, 100n);
  assert.equal(coverage.incidentHaltRequired, true);
  assert.equal(coverage.controlledCovered, false);
  assert.equal(coverage.totalCovered, false);
});

test("blocks new signature commitments during an unresolved incident even with excess reserve", () => {
  const twoClaims: ReserveCoverageState = {
    ...burnedState,
    controlledAssets: 2011n,
    withdrawalClaims: [payableClaim("wd-old"), payableClaim("wd-new")],
  };
  const oldSigned = signWithdrawal(twoClaims, {
    claimId: "wd-old",
    transactionId: TX_ID,
    selectedInput: 101n,
    principal: 100n,
    inFlightChange: 0n,
    networkFee: 1n,
  });
  const unresolved = markWithdrawalUnresolved(oldSigned, "wd-old");

  assert.equal(calculateReserveCoverage(unresolved).controlledCovered, true);
  assert.throws(
    () => signWithdrawal(unresolved, {
      claimId: "wd-new",
      transactionId: OTHER_TX_ID,
      selectedInput: 101n,
      principal: 100n,
      inFlightChange: 0n,
      networkFee: 1n,
    }),
    /blocked during an unresolved withdrawal incident/,
  );
});

test("rejects cross-claim offsets and duplicate claim identifiers", () => {
  assert.throws(
    () =>
      calculateReserveCoverage({
        ...burnedState,
        withdrawalClaims: [
          payableClaim("wd-funded", 100n),
          {
            claimId: "wd-unfunded",
            transactionId: TX_ID,
            payable: 0n,
            status: "broadcast",
            selectedInput: 100n,
            inTransitPrincipal: 100n,
            inFlightChange: 0n,
            networkFee: 0n,
          },
        ],
      }),
    /withdrawal payable must be positive/,
  );

  assert.throws(
    () =>
      calculateReserveCoverage({
        ...burnedState,
        withdrawalClaims: [payableClaim("duplicate"), payableClaim("duplicate")],
      }),
    /duplicate withdrawal claim/,
  );

  const committedClaim = (claimId: string): WithdrawalClaim => ({
    claimId,
    transactionId: TX_ID,
    payable: 100n,
    status: "broadcast",
    selectedInput: 101n,
    inTransitPrincipal: 100n,
    inFlightChange: 0n,
    networkFee: 1n,
  });
  assert.throws(
    () => calculateReserveCoverage({
      ...burnedState,
      controlledAssets: 2000n,
      withdrawalClaims: [committedClaim("wd-a"), committedClaim("wd-b")],
      committedTransactionIds: [TX_ID],
    }),
    /duplicate committed transaction ID/,
  );
});

test("rejects an unbalanced selected-input equation", () => {
  assert.throws(
    () =>
      calculateReserveCoverage({
        ...burnedState,
        withdrawalClaims: [
          {
            claimId: "wd-1",
            transactionId: TX_ID,
            payable: 100n,
            status: "broadcast",
            selectedInput: 150n,
            inTransitPrincipal: 100n,
            inFlightChange: 40n,
            networkFee: 1n,
          },
        ],
      }),
    /principal plus change plus network fee/,
  );
});

test("rejects an unknown persisted claim status before financial arithmetic", () => {
  const invalidClaim = {
    ...payableClaim(),
    status: "cancelled",
    selectedInput: 100n,
    inTransitPrincipal: 100n,
  } as unknown as WithdrawalClaim;

  assert.throws(
    () => calculateReserveCoverage({ ...burnedState, withdrawalClaims: [invalidClaim] }),
    /status is invalid/,
  );
});

test("validates malformed persisted claims before broadcast, confirmation, or restoration", () => {
  const malformedSigned = {
    ...payableClaim(),
    status: "signed",
    transactionId: TX_ID,
    selectedInput: 101n,
    inTransitPrincipal: 100n,
    inFlightChange: 1000n,
    networkFee: 1n,
  } as WithdrawalClaim;
  const malformedMined = { ...malformedSigned, status: "mined" } as WithdrawalClaim;

  assert.throws(
    () => broadcastWithdrawal({ ...burnedState, withdrawalClaims: [malformedSigned] }, "wd-1"),
    /principal plus change plus network fee/,
  );
  assert.throws(
    () => confirmWithdrawal({ ...burnedState, withdrawalClaims: [malformedMined] }, "wd-1"),
    /principal plus change plus network fee/,
  );
  assert.throws(
    () => applyVerifiedInputRestoration({ ...burnedState, withdrawalClaims: [malformedMined] }, {
      claimId: "wd-1",
      transactionId: TX_ID,
      selectedInput: 101n,
      evidenceReference: "recovery:malformed",
      inputsSpendable: true,
      transactionCannotConfirm: true,
    }),
    /principal plus change plus network fee/,
  );
});

test("rehydrates the financial state across a sign-to-broadcast object round trip", () => {
  const signed = signWithdrawal(burnedState, {
    claimId: "wd-1",
    transactionId: TX_ID,
    selectedInput: 101n,
    principal: 100n,
    inFlightChange: 0n,
    networkFee: 1n,
  });
  const coverageBeforeRehydration = calculateReserveCoverage(signed);
  const rehydratedSignedState: ReserveCoverageState = {
    ...signed,
    withdrawalClaims: signed.withdrawalClaims.map((claim) => ({ ...claim })),
  };
  const broadcast = broadcastWithdrawal(rehydratedSignedState, "wd-1");

  assert.equal(signed.withdrawalClaims[0]?.status, "signed");
  assert.equal(broadcast.withdrawalClaims[0]?.status, "broadcast");
  assert.equal(broadcast.controlledAssets, signed.controlledAssets);
  assert.deepEqual(calculateReserveCoverage(broadcast), coverageBeforeRehydration);
});

test("rejects signing two claims with the same native transaction ID", () => {
  const twoClaims: ReserveCoverageState = {
    ...burnedState,
    controlledAssets: 2011n,
    withdrawalClaims: [payableClaim("wd-a"), payableClaim("wd-b")],
  };
  const firstSigned = signWithdrawal(twoClaims, {
    claimId: "wd-a",
    transactionId: TX_ID,
    selectedInput: 101n,
    principal: 100n,
    inFlightChange: 0n,
    networkFee: 1n,
  });

  assert.throws(
    () => signWithdrawal(firstSigned, {
      claimId: "wd-b",
      transactionId: TX_ID,
      selectedInput: 101n,
      principal: 100n,
      inFlightChange: 0n,
      networkFee: 1n,
    }),
    /duplicate committed transaction ID/,
  );

  const firstConfirmed = confirmWithdrawal(
    markWithdrawalMined(broadcastWithdrawal(firstSigned, "wd-a"), "wd-a"),
    "wd-a",
  );
  assert.throws(
    () => signWithdrawal({
      ...firstConfirmed,
      withdrawalClaims: [payableClaim("wd-c")],
    }, {
      claimId: "wd-c",
      transactionId: TX_ID,
      selectedInput: 101n,
      principal: 100n,
      inFlightChange: 0n,
      networkFee: 1n,
    }),
    /duplicate committed transaction ID/,
  );
});

test("blocks repeat signing, unsigned broadcast, early confirmation, and invalid restoration inputs", () => {
  const signed = signWithdrawal(burnedState, {
    claimId: "wd-1",
    transactionId: TX_ID,
    selectedInput: 101n,
    principal: 100n,
    inFlightChange: 0n,
    networkFee: 1n,
  });
  const broadcast = broadcastWithdrawal(signed, "wd-1");

  assert.throws(
    () => signWithdrawal(signed, { claimId: "wd-1", transactionId: OTHER_TX_ID, selectedInput: 101n, principal: 100n, inFlightChange: 0n, networkFee: 1n }),
    /only a payable claim can be signed/,
  );
  assert.throws(() => broadcastWithdrawal(burnedState, "wd-1"), /only a signed claim/);
  assert.throws(() => broadcastWithdrawal(broadcast, "wd-1"), /only a signed claim/);
  assert.throws(() => confirmWithdrawal(broadcast, "wd-1"), /only a mined claim/);
  assert.throws(
    () => applyVerifiedInputRestoration(burnedState, {
      claimId: "wd-1",
      transactionId: TX_ID,
      selectedInput: 0n,
      evidenceReference: "recovery:wd-1:none",
      inputsSpendable: true,
      transactionCannotConfirm: true,
    }),
    /only an unresolved claim/,
  );
  const unresolved = markWithdrawalUnresolved(signed, "wd-1");
  assert.throws(
    () => applyVerifiedInputRestoration(unresolved, {
      claimId: "wd-1",
      transactionId: TX_ID,
      selectedInput: 999n,
      evidenceReference: "recovery:wd-1:mismatch",
      inputsSpendable: true,
      transactionCannotConfirm: true,
    }),
    /does not match/,
  );
  assert.throws(
    () => applyVerifiedInputRestoration(unresolved, {
      claimId: "wd-1",
      transactionId: OTHER_TX_ID,
      selectedInput: 101n,
      evidenceReference: "recovery:wd-1:wrong-transaction",
      inputsSpendable: true,
      transactionCannotConfirm: true,
    }),
    /transaction ID does not match/,
  );
});

test("recovers an unresolved claim only from an exact verified transaction observation", () => {
  const signed = signWithdrawal(burnedState, {
    claimId: "wd-1",
    transactionId: TX_ID,
    selectedInput: 101n,
    principal: 100n,
    inFlightChange: 0n,
    networkFee: 1n,
  });
  const unresolved = markWithdrawalUnresolved(broadcastWithdrawal(signed, "wd-1"), "wd-1");

  assert.throws(
    () => applyVerifiedTransactionObservation(unresolved, {
      claimId: "wd-1",
      transactionId: OTHER_TX_ID,
      evidenceReference: "observer:zebra-2:height-123",
      observedStatus: "mined",
    }),
    /does not match the committed transaction/,
  );
  assert.throws(
    () => applyVerifiedTransactionObservation(unresolved, {
      claimId: "wd-1",
      transactionId: TX_ID,
      evidenceReference: "observer:zebra-2:height-123",
      observedStatus: "confirmed",
    } as never),
    /status is invalid/,
  );

  const mined = applyVerifiedTransactionObservation(unresolved, {
    claimId: "wd-1",
    transactionId: TX_ID,
    evidenceReference: "observer:zebra-2:height-123",
    observedStatus: "mined",
  });
  const coverage = calculateReserveCoverage(mined);

  assert.equal(mined.withdrawalClaims[0]?.status, "mined");
  assert.equal(coverage.inTransitPrincipal, 100n);
  assert.equal(coverage.unresolvedPrincipal, 0n);
  assert.equal(coverage.incidentHaltRequired, false);
  assert.equal(confirmWithdrawal(mined, "wd-1").withdrawalClaims.length, 0);
});
