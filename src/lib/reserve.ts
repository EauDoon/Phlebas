export type WithdrawalClaimStatus = "payable" | "signed" | "broadcast" | "mined" | "unresolved";

export type WithdrawalClaim = {
  claimId: string;
  transactionId: string;
  payable: bigint;
  status: WithdrawalClaimStatus;
  selectedInput: bigint;
  inTransitPrincipal: bigint;
  inFlightChange: bigint;
  networkFee: bigint;
};

export type ReserveCoverageState = {
  controlledAssets: bigint;
  tokenSupply: bigint;
  depositEntitlements: bigint;
  withdrawalClaims: ReadonlyArray<WithdrawalClaim>;
  committedTransactionIds: ReadonlyArray<string>;
  otherLiabilities: bigint;
  requiredBuffer: bigint;
};

export type ReserveCoverage = {
  controlledRequirement: bigint;
  totalRequirement: bigint;
  withdrawalPayables: bigint;
  inTransitPrincipal: bigint;
  unresolvedPrincipal: bigint;
  inFlightChange: bigint;
  incidentHaltRequired: boolean;
  controlledCovered: boolean;
  totalCovered: boolean;
};

type WithdrawalCommitment = {
  claimId: string;
  transactionId: string;
  selectedInput: bigint;
  principal: bigint;
  inFlightChange: bigint;
  networkFee: bigint;
};

export type VerifiedInputRestoration = {
  claimId: string;
  transactionId: string;
  selectedInput: bigint;
  evidenceReference: string;
  inputsSpendable: true;
  transactionCannotConfirm: true;
};

export type VerifiedTransactionObservation = {
  claimId: string;
  transactionId: string;
  evidenceReference: string;
  observedStatus: "broadcast" | "mined";
};

function assertNonNegative(name: string, value: bigint) {
  if (value < 0n) throw new RangeError(`${name} cannot be negative`);
}

function assertClaim(claim: WithdrawalClaim) {
  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(claim.claimId)) {
    throw new TypeError("claimId must be a bounded ASCII identifier");
  }
  if (!["payable", "signed", "broadcast", "mined", "unresolved"].includes(claim.status)) {
    throw new TypeError("withdrawal claim status is invalid");
  }
  if (claim.status === "payable" && claim.transactionId !== "") {
    throw new TypeError("a payable claim cannot contain a transaction ID");
  }
  if (claim.status !== "payable" && !/^[0-9a-f]{64}$/.test(claim.transactionId)) {
    throw new TypeError("a committed claim requires one canonical transaction ID");
  }

  for (const [name, value] of [
    ["payable", claim.payable],
    ["selectedInput", claim.selectedInput],
    ["inTransitPrincipal", claim.inTransitPrincipal],
    ["inFlightChange", claim.inFlightChange],
    ["networkFee", claim.networkFee],
  ] as const) {
    assertNonNegative(name, value);
  }
  if (claim.payable === 0n) {
    throw new RangeError("withdrawal payable must be positive");
  }

  if (claim.status === "payable") {
    if (
      claim.selectedInput !== 0n ||
      claim.inTransitPrincipal !== 0n ||
      claim.inFlightChange !== 0n ||
      claim.networkFee !== 0n
    ) {
      throw new RangeError("a payable claim cannot contain committed transaction values");
    }
    return;
  }

  if (claim.status === "unresolved" && claim.inTransitPrincipal !== 0n) {
    throw new RangeError("an unresolved claim cannot count principal in transit");
  }
  if (claim.status !== "unresolved" && claim.inTransitPrincipal !== claim.payable) {
    throw new RangeError("committed principal must exactly match its withdrawal payable");
  }
  if (claim.selectedInput !== claim.payable + claim.inFlightChange + claim.networkFee) {
    throw new RangeError("selected input must equal principal plus change plus network fee");
  }
}

function replaceClaim(
  state: ReserveCoverageState,
  claimId: string,
  update: (claim: WithdrawalClaim) => WithdrawalClaim | null,
): ReserveCoverageState {
  let matches = 0;
  const withdrawalClaims: WithdrawalClaim[] = [];
  for (const claim of state.withdrawalClaims) {
    if (claim.claimId !== claimId) {
      withdrawalClaims.push(claim);
      continue;
    }
    matches += 1;
    const next = update(claim);
    if (next) withdrawalClaims.push(next);
  }
  if (matches !== 1) throw new TypeError("withdrawal claim must exist exactly once");
  return { ...state, withdrawalClaims };
}

export function calculateReserveCoverage(state: ReserveCoverageState): ReserveCoverage {
  for (const [name, value] of [
    ["controlledAssets", state.controlledAssets],
    ["tokenSupply", state.tokenSupply],
    ["depositEntitlements", state.depositEntitlements],
    ["otherLiabilities", state.otherLiabilities],
    ["requiredBuffer", state.requiredBuffer],
  ] as const) {
    assertNonNegative(name, value);
  }

  const seenClaimIds = new Set<string>();
  const committedTransactionIds = new Set<string>();
  for (const transactionId of state.committedTransactionIds) {
    if (!/^[0-9a-f]{64}$/.test(transactionId)) {
      throw new TypeError("transaction history requires canonical transaction IDs");
    }
    if (committedTransactionIds.has(transactionId)) {
      throw new TypeError(`duplicate committed transaction ID: ${transactionId}`);
    }
    committedTransactionIds.add(transactionId);
  }
  const activeTransactionIds = new Set<string>();
  let withdrawalPayables = 0n;
  let inTransitPrincipal = 0n;
  let unresolvedPrincipal = 0n;
  let inFlightChange = 0n;
  let incidentHaltRequired = false;

  for (const claim of state.withdrawalClaims) {
    assertClaim(claim);
    if (seenClaimIds.has(claim.claimId)) {
      throw new TypeError(`duplicate withdrawal claim: ${claim.claimId}`);
    }
    seenClaimIds.add(claim.claimId);
    if (claim.transactionId !== "") {
      if (!committedTransactionIds.has(claim.transactionId)) {
        throw new TypeError("active transaction ID is absent from committed transaction history");
      }
      if (activeTransactionIds.has(claim.transactionId)) {
        throw new TypeError(`duplicate committed transaction ID: ${claim.transactionId}`);
      }
      activeTransactionIds.add(claim.transactionId);
    }
    withdrawalPayables += claim.payable;
    inTransitPrincipal += claim.inTransitPrincipal;
    if (claim.status === "unresolved") unresolvedPrincipal += claim.payable;
    inFlightChange += claim.inFlightChange;
    incidentHaltRequired ||= claim.status === "unresolved";
  }

  const controlledRequirement =
    state.tokenSupply +
    state.depositEntitlements +
    (withdrawalPayables - inTransitPrincipal) +
    state.otherLiabilities +
    state.requiredBuffer;
  const totalRequirement =
    state.tokenSupply +
    state.depositEntitlements +
    withdrawalPayables +
    state.otherLiabilities +
    state.requiredBuffer;

  return {
    controlledRequirement,
    totalRequirement,
    withdrawalPayables,
    inTransitPrincipal,
    unresolvedPrincipal,
    inFlightChange,
    incidentHaltRequired,
    controlledCovered: state.controlledAssets >= controlledRequirement,
    totalCovered: state.controlledAssets + inTransitPrincipal >= totalRequirement,
  };
}

export function signWithdrawal(
  state: ReserveCoverageState,
  transaction: WithdrawalCommitment,
): ReserveCoverageState {
  const currentCoverage = calculateReserveCoverage(state);
  if (currentCoverage.incidentHaltRequired) {
    throw new TypeError("new signature commitment is blocked during an unresolved withdrawal incident");
  }
  if (state.committedTransactionIds.includes(transaction.transactionId)) {
    throw new TypeError(`duplicate committed transaction ID: ${transaction.transactionId}`);
  }
  const next = replaceClaim(state, transaction.claimId, (claim) => {
    if (claim.status !== "payable") throw new TypeError("only a payable claim can be signed");
    const committed: WithdrawalClaim = {
      ...claim,
      status: "signed",
      transactionId: transaction.transactionId,
      selectedInput: transaction.selectedInput,
      inTransitPrincipal: transaction.principal,
      inFlightChange: transaction.inFlightChange,
      networkFee: transaction.networkFee,
    };
    assertClaim(committed);
    return committed;
  });
  const postSignature = {
    ...next,
    controlledAssets: next.controlledAssets - transaction.selectedInput,
    committedTransactionIds: [...next.committedTransactionIds, transaction.transactionId],
  };
  const coverage = calculateReserveCoverage(postSignature);
  if (!coverage.controlledCovered || !coverage.totalCovered) {
    throw new RangeError("post-signature reserve coverage would be insufficient");
  }
  return postSignature;
}

export function refundWithdrawalBeforeSignature(
  state: ReserveCoverageState,
  claimId: string,
): ReserveCoverageState {
  calculateReserveCoverage(state);
  let restoredSupply = 0n;
  const next = replaceClaim(state, claimId, (claim) => {
    if (
      claim.status === "signed" ||
      claim.status === "broadcast" ||
      claim.status === "mined" ||
      claim.status === "unresolved"
    ) {
      throw new TypeError("once a native transaction is signed, the claim cannot be refunded");
    }
    if (claim.status !== "payable") {
      throw new TypeError("only a payable claim can be refunded before signature");
    }
    restoredSupply = claim.payable;
    return null;
  });
  const refunded = {
    ...next,
    tokenSupply: next.tokenSupply + restoredSupply,
  };
  calculateReserveCoverage(refunded);
  return refunded;
}

export function broadcastWithdrawal(state: ReserveCoverageState, claimId: string): ReserveCoverageState {
  calculateReserveCoverage(state);
  const broadcast = replaceClaim(state, claimId, (claim) => {
    if (claim.status !== "signed") throw new TypeError("only a signed claim can be broadcast");
    return { ...claim, status: "broadcast" };
  });
  calculateReserveCoverage(broadcast);
  return broadcast;
}

export function markWithdrawalMined(state: ReserveCoverageState, claimId: string): ReserveCoverageState {
  calculateReserveCoverage(state);
  const mined = replaceClaim(state, claimId, (claim) => {
    if (claim.status !== "broadcast") throw new TypeError("only a broadcast claim can be mined");
    return { ...claim, status: "mined" };
  });
  calculateReserveCoverage(mined);
  return mined;
}

export function markWithdrawalUnresolved(state: ReserveCoverageState, claimId: string): ReserveCoverageState {
  calculateReserveCoverage(state);
  const unresolved = replaceClaim(state, claimId, (claim) => {
    if (claim.status === "payable" || claim.status === "unresolved") {
      throw new TypeError("only an active committed transaction can become unresolved");
    }
    return { ...claim, status: "unresolved", inTransitPrincipal: 0n };
  });
  calculateReserveCoverage(unresolved);
  return unresolved;
}

export function applyVerifiedTransactionObservation(
  state: ReserveCoverageState,
  observation: VerifiedTransactionObservation,
): ReserveCoverageState {
  calculateReserveCoverage(state);
  if (!/^[A-Za-z0-9:._/-]{1,256}$/.test(observation.evidenceReference)) {
    throw new TypeError("verified transaction observation requires a bounded evidence reference");
  }
  if (observation.observedStatus !== "broadcast" && observation.observedStatus !== "mined") {
    throw new TypeError("verified transaction observation status is invalid");
  }
  const observed = replaceClaim(state, observation.claimId, (claim) => {
    if (claim.status !== "unresolved") {
      throw new TypeError("only an unresolved claim can apply a verified transaction observation");
    }
    if (claim.transactionId !== observation.transactionId) {
      throw new TypeError("observed transaction ID does not match the committed transaction");
    }
    return {
      ...claim,
      status: observation.observedStatus,
      inTransitPrincipal: claim.payable,
    };
  });
  calculateReserveCoverage(observed);
  return observed;
}

export function confirmWithdrawal(state: ReserveCoverageState, claimId: string): ReserveCoverageState {
  calculateReserveCoverage(state);
  let confirmedChange = 0n;
  const next = replaceClaim(state, claimId, (claim) => {
    if (claim.status !== "mined") throw new TypeError("only a mined claim can be confirmed");
    confirmedChange = claim.inFlightChange;
    return null;
  });
  const confirmed = { ...next, controlledAssets: next.controlledAssets + confirmedChange };
  calculateReserveCoverage(confirmed);
  return confirmed;
}

export function applyVerifiedInputRestoration(
  state: ReserveCoverageState,
  verification: VerifiedInputRestoration,
): ReserveCoverageState {
  calculateReserveCoverage(state);
  if (!/^[A-Za-z0-9:._/-]{1,256}$/.test(verification.evidenceReference)) {
    throw new TypeError("verified restoration requires a bounded evidence reference");
  }
  if (verification.inputsSpendable !== true || verification.transactionCannotConfirm !== true) {
    throw new TypeError("verified restoration requires both external recovery conclusions");
  }
  let restoredInput = 0n;
  const next = replaceClaim(state, verification.claimId, (claim) => {
    if (claim.status !== "unresolved") {
      throw new TypeError("only an unresolved claim can apply verified input restoration");
    }
    if (claim.selectedInput !== verification.selectedInput) {
      throw new TypeError("verified selected input does not match the committed transaction");
    }
    if (claim.transactionId !== verification.transactionId) {
      throw new TypeError("verified transaction ID does not match the committed transaction");
    }
    restoredInput = claim.selectedInput;
    return {
      ...claim,
      status: "payable",
      transactionId: "",
      selectedInput: 0n,
      inTransitPrincipal: 0n,
      inFlightChange: 0n,
      networkFee: 0n,
    };
  });
  const restored = { ...next, controlledAssets: next.controlledAssets + restoredInput };
  calculateReserveCoverage(restored);
  return restored;
}
