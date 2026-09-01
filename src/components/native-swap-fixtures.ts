import type { MarketId } from "@/lib/market-data";
import {
  USDT_SETTLEMENT_DISABLED,
  settlementEvidence,
  settlementPhaseCopy,
  settlementTicketAction,
  type SettlementTicketScenario,
  type SettlementTicketSession,
} from "@/lib/settlement-ticket-copy";
import {
  deriveSwapFillId,
  hashSwapMarketPolicy,
  type SwapMarketPolicyV1,
  type SwapTermsV1,
  validateSwapTerms,
} from "@/lib/swap-domain";
import {
  hashSwapFinalityPolicy,
  hashSwapObserverPolicy,
  hashSwapTimingPolicy,
  swapDeadlineStatus,
  type SwapEvidencePolicies,
  type SwapTimingPolicy,
} from "@/lib/swap-policy";
import {
  authorizeSwapTerms,
  confirmSwapFunding,
  confirmSwapSpend,
  createSwapState,
  flagSwapDispute,
  fundingFactId,
  observeSwapFunding,
  observeSwapSpend,
  prepareSwapFunding,
  retractSwapEvidence,
  spendFactId,
  swapPhase,
  type FundingEvidence,
  type SpendEvidence,
  type SwapState,
} from "@/lib/swap-state";

export type NativeSwapScenario = SettlementTicketScenario;

export type NativeSwapFixtureSession = SettlementTicketSession & Readonly<{
  marketId: "ZEC/USDC";
}>;

export type NativeSwapFixture =
  | Readonly<{ availability: "ready"; session: NativeSwapFixtureSession }>
  | Readonly<{ availability: "disabled"; marketId: "ZEC/USDT"; reason: string }>;

export type NativeSwapAction = Readonly<{
  label: string;
  enabled: boolean;
  disabledReason?: string;
}>;

export const nativeSwapScenarios: readonly Readonly<{
  id: NativeSwapScenario;
  label: string;
}>[] = [
  { id: "happy", label: "Happy path" },
  { id: "refund", label: "Refund recovery" },
  { id: "stale", label: "Stale observer" },
  { id: "conflict", label: "Conflicting observers" },
  { id: "reorganization", label: "Claim reorganization" },
  { id: "contract-mismatch", label: "Contract mismatch" },
] as const;

const hex32 = (byte: string) => `0x${byte.repeat(32)}` as SwapTermsV1["fillId"];
const hex20 = (byte: string) => `0x${byte.repeat(20)}` as `0x${string}`;

const fixtureZecChain = "bip122:00040fe8ec8471911baa1db1266ea15d";
const fixtureQuoteChain = "eip155:421614";

const fixtureMarketPolicy: SwapMarketPolicyV1 = {
  version: 1,
  markets: [{
    zecChain: fixtureZecChain,
    zecAsset: `${fixtureZecChain}/slip44:133`,
    quoteChain: fixtureQuoteChain,
    quoteAsset: `${fixtureQuoteChain}/erc20:0x1111111111111111111111111111111111111111`,
  }],
};

const fixtureEvidencePolicies: SwapEvidencePolicies = {
  observer: {
    version: 1,
    sourceIds: [hex32("37"), hex32("38")],
    requiredSourceCount: 2n,
    maxObservationDelaySeconds: 600n,
  },
  zecFinality: {
    version: 1,
    chain: fixtureZecChain,
    minimumConfirmations: 10n,
    minimumAgeSeconds: 60n,
  },
  evmFinality: {
    version: 1,
    chain: fixtureQuoteChain,
    minimumConfirmations: 20n,
    minimumAgeSeconds: 30n,
  },
};

const fixtureTimingPolicy: SwapTimingPolicy = {
  minimumFundingWindowSeconds: 100n,
  minimumClaimWindowSeconds: 100n,
  minimumSafetyWindowSeconds: 500n,
};

const fixtureZecOrderHash = hex32("12");
const fixtureStablecoinOrderHash = hex32("13");
const fixtureFillFields = {
  zecOrderHash: fixtureZecOrderHash,
  stablecoinOrderHash: fixtureStablecoinOrderHash,
  fillIndex: 0n,
  zecAmountZatoshis: 100_000_000n,
  quoteAmountAtoms: 52_910_000n,
  executionPriceTicks: 5_291n,
};

const fixtureTerms: SwapTermsV1 = {
  version: 1,
  fillId: deriveSwapFillId(fixtureFillFields),
  ...fixtureFillFields,
  zecSellerId: hex32("14"),
  stablecoinSellerId: hex32("15"),
  zecChain: fixtureZecChain,
  zecAsset: `${fixtureZecChain}/slip44:133`,
  quoteChain: fixtureQuoteChain,
  quoteAsset: "eip155:421614/erc20:0x1111111111111111111111111111111111111111",
  protocolFeeQuoteAtoms: 0n,
  feeRecipient: hex20("a3"),
  maximumFeeBps: 30n,
  zcashLockScriptHash: hex20("a1"),
  zcashClaimPubKeyHash: hex20("b1"),
  zcashRefundPubKeyHash: hex20("c1"),
  evmFunder: hex20("d1"),
  evmClaimRecipient: hex20("e1"),
  evmRefundRecipient: hex20("f1"),
  evmEscrowContract: hex20("a2"),
  secretHash: "0x425ed4e4a36b30ea21b90e21c712c649e8214c29b7eaf68089d1039c6e55384c",
  authorizationDeadline: 1_700_000_100n,
  zecFundBy: 1_700_000_300n,
  evmFundBy: 1_700_000_500n,
  evmClaimSafetyCutoff: 1_700_000_700n,
  evmRefundTime: 1_700_001_000n,
  zecRefundTime: 1_700_001_600n,
  timeoutPolicyId: hashSwapTimingPolicy(fixtureTimingPolicy),
  marketPolicyId: hashSwapMarketPolicy(fixtureMarketPolicy),
  observerPolicyId: hashSwapObserverPolicy(fixtureEvidencePolicies.observer),
  zecFinalityPolicyId: hashSwapFinalityPolicy(fixtureEvidencePolicies.zecFinality),
  evmFinalityPolicyId: hashSwapFinalityPolicy(fixtureEvidencePolicies.evmFinality),
};

const fixturePreimage = `0x${"42".repeat(32)}` as const;

function fundingEvidence(leg: "zec" | "evm", observerIndex: 0 | 1 = 0): FundingEvidence {
  const identity = createSwapState(
    validateSwapTerms(fixtureTerms),
    fixtureTimingPolicy,
    fixtureEvidencePolicies,
    fixtureMarketPolicy,
  );
  const blockHeight = leg === "zec" ? 2_100_001n : 12_300_001n;
  const executedAtSeconds = (leg === "zec" ? fixtureTerms.zecFundBy : fixtureTerms.evmFundBy) - 1n;
  const unsigned = {
    leg,
    swapId: identity.swapId,
    termsHash: identity.termsHash,
    transactionId: leg === "zec" ? hex32("33") : hex32("34"),
    blockHash: leg === "zec" ? hex32("35") : hex32("36"),
    blockHeight,
    executedAtSeconds,
    outputIndex: 0n,
    chain: leg === "zec" ? fixtureTerms.zecChain : fixtureTerms.quoteChain,
    asset: leg === "zec" ? fixtureTerms.zecAsset : fixtureTerms.quoteAsset,
    amountAtoms: leg === "zec" ? fixtureTerms.zecAmountZatoshis : fixtureTerms.quoteAmountAtoms,
    lockIdentity: leg === "zec" ? fixtureTerms.zcashLockScriptHash : fixtureTerms.evmEscrowContract,
    escrowRecordId: identity.swapId,
    funder: leg === "zec" ? fixtureTerms.zecSellerId : fixtureTerms.evmFunder,
    claimRecipient: leg === "zec" ? fixtureTerms.zcashClaimPubKeyHash : fixtureTerms.evmClaimRecipient,
    refundRecipient: leg === "zec" ? fixtureTerms.zcashRefundPubKeyHash : fixtureTerms.evmRefundRecipient,
    secretHash: fixtureTerms.secretHash,
    refundTime: leg === "zec" ? fixtureTerms.zecRefundTime : fixtureTerms.evmRefundTime,
    successful: true,
  } as const;
  const fact = { factId: fundingFactId(unsigned), ...unsigned };
  const finality = leg === "zec" ? fixtureEvidencePolicies.zecFinality : fixtureEvidencePolicies.evmFinality;
  return {
    fact,
    attestation: {
      evidenceId: leg === "zec" ? (observerIndex === 0 ? hex32("31") : hex32("39")) : (observerIndex === 0 ? hex32("32") : hex32("3a")),
      factId: fact.factId,
      sourceId: fixtureEvidencePolicies.observer.sourceIds[observerIndex]!,
      observerPolicyId: fixtureTerms.observerPolicyId,
      finalityPolicyId: leg === "zec" ? fixtureTerms.zecFinalityPolicyId : fixtureTerms.evmFinalityPolicyId,
      observedAtSeconds: executedAtSeconds + finality.minimumAgeSeconds,
      tipBlockHash: leg === "zec" ? hex32("3b") : hex32("3d"),
      tipBlockHeight: blockHeight + finality.minimumConfirmations - 1n,
    },
  };
}

function spendEvidence(
  leg: "zec" | "evm",
  action: "claim" | "refund",
  executedAtSeconds: bigint,
  observerIndex: 0 | 1 = 0,
): SpendEvidence {
  const evidenceIds = {
    "evm-claim": hex32("41"),
    "zec-claim": hex32("42"),
    "evm-refund": hex32("43"),
    "zec-refund": hex32("44"),
  } as const;
  const transactionIds = {
    "evm-claim": hex32("51"),
    "zec-claim": hex32("52"),
    "evm-refund": hex32("53"),
    "zec-refund": hex32("54"),
  } as const;
  const key = `${leg}-${action}` as keyof typeof evidenceIds;
  const funding = fundingEvidence(leg).fact;
  const blockHeight = leg === "zec" ? 2_100_010n : 12_300_010n;
  const unsigned = {
    fundingFactId: funding.factId,
    fundingTransactionId: funding.transactionId,
    fundingOutputIndex: funding.outputIndex,
    leg,
    action,
    swapId: funding.swapId,
    termsHash: funding.termsHash,
    transactionId: transactionIds[key],
    blockHash: leg === "zec" ? hex32("55") : hex32("56"),
    blockHeight,
    executedAtSeconds,
    inputOrLogIndex: 0n,
    chain: leg === "zec" ? fixtureTerms.zecChain : fixtureTerms.quoteChain,
    asset: leg === "zec" ? fixtureTerms.zecAsset : fixtureTerms.quoteAsset,
    amountAtoms: leg === "zec" ? fixtureTerms.zecAmountZatoshis : fixtureTerms.quoteAmountAtoms,
    lockIdentity: leg === "zec" ? fixtureTerms.zcashLockScriptHash : fixtureTerms.evmEscrowContract,
    escrowRecordId: funding.escrowRecordId,
    recipient: leg === "zec"
      ? (action === "claim" ? fixtureTerms.zcashClaimPubKeyHash : fixtureTerms.zcashRefundPubKeyHash)
      : (action === "claim" ? fixtureTerms.evmClaimRecipient : fixtureTerms.evmRefundRecipient),
    successful: true,
    ...(action === "claim" ? { preimage: fixturePreimage } : {}),
  } as const;
  const fact = { factId: spendFactId(unsigned), ...unsigned };
  const finality = leg === "zec" ? fixtureEvidencePolicies.zecFinality : fixtureEvidencePolicies.evmFinality;
  return {
    fact,
    attestation: {
      evidenceId: observerIndex === 0 ? evidenceIds[key] : hex32(key === "evm-claim" ? "45" : key === "zec-claim" ? "46" : key === "evm-refund" ? "47" : "48"),
      factId: fact.factId,
      sourceId: fixtureEvidencePolicies.observer.sourceIds[observerIndex]!,
      observerPolicyId: fixtureTerms.observerPolicyId,
      finalityPolicyId: leg === "zec" ? fixtureTerms.zecFinalityPolicyId : fixtureTerms.evmFinalityPolicyId,
      observedAtSeconds: executedAtSeconds + finality.minimumAgeSeconds,
      tipBlockHash: hex32(key === "evm-claim" ? "57" : key === "zec-claim" ? "58" : key === "evm-refund" ? "59" : "5a"),
      tipBlockHeight: blockHeight + finality.minimumConfirmations - 1n,
    },
  };
}

function createdSwap(): SwapState {
  return createSwapState(validateSwapTerms(fixtureTerms), fixtureTimingPolicy, fixtureEvidencePolicies, fixtureMarketPolicy);
}

function authorizedSwap(): SwapState {
  const created = createdSwap();
  const zecAuthorized = authorizeSwapTerms(
    created,
    fixtureTerms.zecSellerId,
    created.termsHash,
    fixtureTerms.authorizationDeadline - 2n,
  );
  return authorizeSwapTerms(
    zecAuthorized,
    fixtureTerms.stablecoinSellerId,
    zecAuthorized.termsHash,
    fixtureTerms.authorizationDeadline - 1n,
  );
}

function fundedSwap(): SwapState {
  const zecPrepared = prepareSwapFunding(
    authorizedSwap(),
    "zec",
    hex32("61"),
    fixtureTerms.zecFundBy - 1n,
  );
  const zecFirst = fundingEvidence("zec", 0);
  const zecSecond = fundingEvidence("zec", 1);
  const zecSeen = observeSwapFunding(observeSwapFunding(zecPrepared, zecFirst), zecSecond);
  const zecFunded = confirmSwapFunding(zecSeen, "zec", zecFirst.fact.factId, zecFirst.attestation.observedAtSeconds);
  const evmPrepared = prepareSwapFunding(
    zecFunded,
    "evm",
    hex32("62"),
    fixtureTerms.evmFundBy - 1n,
  );
  const evmFirst = fundingEvidence("evm", 0);
  const evmSecond = fundingEvidence("evm", 1);
  const evmSeen = observeSwapFunding(observeSwapFunding(evmPrepared, evmFirst), evmSecond);
  return confirmSwapFunding(evmSeen, "evm", evmFirst.fact.factId, evmFirst.attestation.observedAtSeconds);
}

function unsafeState(scenario: Exclude<NativeSwapScenario, "happy" | "refund">): SwapState {
  const funded = fundedSwap();
  if (scenario === "stale") {
    return flagSwapDispute(funded, "observer-stale", "Approved observer watermark is stale.");
  }
  if (scenario === "conflict") {
    return flagSwapDispute(funded, "observer-conflict", "Approved observers disagree on the stablecoin lock.");
  }
  if (scenario === "contract-mismatch") {
    return flagSwapDispute(funded, "semantic-mismatch", "Observed contract identity differs from the signed terms.");
  }
  const claim = spendEvidence("evm", "claim", fixtureTerms.evmClaimSafetyCutoff);
  const revealed = observeSwapSpend(funded, claim);
  return retractSwapEvidence(revealed, claim.attestation.evidenceId, "The EVM claim left the canonical chain.");
}

export function createNativeSwapFixture(
  marketId: MarketId,
  scenario: NativeSwapScenario = "happy",
): NativeSwapFixture {
  if (marketId === "ZEC/USDT") {
    return {
      availability: "disabled",
      marketId,
      reason: USDT_SETTLEMENT_DISABLED.reason,
    };
  }
  const state = scenario === "happy" || scenario === "refund" ? createdSwap() : unsafeState(scenario);
  return {
    availability: "ready",
    session: {
      marketId,
      scenario,
      state,
      nowSeconds: fixtureTerms.authorizationDeadline - 10n,
    },
  };
}

export function nativeSwapAction(session: NativeSwapFixtureSession): NativeSwapAction {
  return settlementTicketAction(session);
}

export function advanceNativeSwapFixture(session: NativeSwapFixtureSession): Readonly<{
  session: NativeSwapFixtureSession;
  announcement: string;
}> {
  const { state, scenario, nowSeconds } = session;
  const phase = swapPhase(state);
  let nextState = state;
  let nextTime = nowSeconds;
  let announcement = "Ticket state unchanged.";

  if (phase === "awaiting-authorizations") {
    const zecAuthorized = authorizeSwapTerms(state, state.terms.zecSellerId, state.termsHash, nowSeconds);
    nextState = authorizeSwapTerms(zecAuthorized, state.terms.stablecoinSellerId, state.termsHash, nowSeconds + 1n);
    announcement = "Exact terms accepted. ZEC P2SH lock preparation is now available.";
  } else if (phase === "awaiting-zec-funding" && state.zec.phase === "unfunded") {
    nextState = prepareSwapFunding(state, "zec", hex32("61"), state.terms.zecFundBy - 1n);
    announcement = "ZEC P2SH lock prepared. No transaction was built or signed.";
  } else if (phase === "awaiting-zec-funding" && state.zec.phase === "funding-prepared") {
    nextState = observeSwapFunding(observeSwapFunding(state, fundingEvidence("zec", 0)), fundingEvidence("zec", 1));
    announcement = "Two ZEC observer reports agree. Policy qualification is still required.";
  } else if (phase === "awaiting-zec-confirmation") {
    const evidence = fundingEvidence("zec", 0);
    nextState = confirmSwapFunding(state, "zec", evidence.fact.factId, evidence.attestation.observedAtSeconds);
    announcement = "ZEC evidence confirmed. Exact-token EVM lock preparation is now available.";
  } else if (phase === "awaiting-evm-funding" && state.evm.phase === "unfunded") {
    nextState = prepareSwapFunding(state, "evm", hex32("62"), state.terms.evmFundBy - 1n);
    announcement = "Exact-token EVM lock prepared. No transaction was built or signed.";
  } else if (phase === "awaiting-evm-funding" && state.evm.phase === "funding-prepared") {
    nextState = observeSwapFunding(observeSwapFunding(state, fundingEvidence("evm", 0)), fundingEvidence("evm", 1));
    announcement = "Two USDC observer reports agree. Policy qualification is still required.";
  } else if (phase === "awaiting-evm-confirmation") {
    const evidence = fundingEvidence("evm", 0);
    nextState = confirmSwapFunding(state, "evm", evidence.fact.factId, evidence.attestation.observedAtSeconds);
    announcement = scenario === "refund"
      ? "Both locks are funded. The refund deadline has not passed."
      : "Both locks are funded. The USDC claim is now available.";
  } else if (phase === "awaiting-evm-claim" && scenario === "refund") {
    const deadlines = swapDeadlineStatus(state.terms, nowSeconds);
    if (!deadlines.evmRefundEligible) {
      nextTime = state.terms.evmRefundTime;
      announcement = "Clock advanced to the USDC refund deadline. No chain time changed.";
    } else {
      nextState = observeSwapSpend(
        observeSwapSpend(state, spendEvidence("evm", "refund", nowSeconds, 0)),
        spendEvidence("evm", "refund", nowSeconds, 1),
      );
      announcement = "Two USDC refund reports agree. Policy qualification is still required.";
    }
  } else if (phase === "awaiting-evm-claim") {
    const executedAt = state.terms.evmClaimSafetyCutoff;
    nextState = observeSwapSpend(
      observeSwapSpend(state, spendEvidence("evm", "claim", executedAt, 0)),
      spendEvidence("evm", "claim", executedAt, 1),
    );
    announcement = "USDC claim evidence recorded. The shared preimage is now visible.";
  } else if (phase === "secret-observed") {
    const evidence = state.evm.spend!;
    const qualifiedAt = state.evm.spendAttestations!.reduce(
      (latest, item) => item.observedAtSeconds > latest ? item.observedAtSeconds : latest,
      0n,
    );
    nextState = confirmSwapSpend(state, "evm", evidence.factId, qualifiedAt);
    announcement = "USDC claim confirmed. The ZEC claim is now available.";
  } else if (phase === "awaiting-zec-claim" && state.zec.phase === "funded-confirmed") {
    const executedAt = state.terms.zecRefundTime - 1n;
    nextState = observeSwapSpend(
      observeSwapSpend(state, spendEvidence("zec", "claim", executedAt, 0)),
      spendEvidence("zec", "claim", executedAt, 1),
    );
    announcement = "ZEC claim evidence recorded. Confirmation is still required.";
  } else if (phase === "awaiting-zec-claim" && state.zec.phase === "claim-seen") {
    const qualifiedAt = state.zec.spendAttestations!.reduce(
      (latest, item) => item.observedAtSeconds > latest ? item.observedAtSeconds : latest,
      0n,
    );
    nextState = confirmSwapSpend(state, "zec", state.zec.spend!.factId, qualifiedAt);
    announcement = "Settled. No asset moved.";
  } else if (phase === "refund-recovery" && state.evm.phase === "refund-seen") {
    const qualifiedAt = state.evm.spendAttestations!.reduce(
      (latest, item) => item.observedAtSeconds > latest ? item.observedAtSeconds : latest,
      0n,
    );
    nextState = confirmSwapSpend(state, "evm", state.evm.spend!.factId, qualifiedAt);
    announcement = "USDC refund confirmed. ZEC remains locked until its later deadline.";
  } else if (phase === "refund-recovery" && state.zec.phase === "funded-confirmed") {
    const deadlines = swapDeadlineStatus(state.terms, nowSeconds);
    if (!deadlines.zecRefundEligible) {
      nextTime = state.terms.zecRefundTime;
      announcement = "Clock advanced to the ZEC refund deadline. No chain time changed.";
    } else {
      nextState = observeSwapSpend(
        observeSwapSpend(state, spendEvidence("zec", "refund", nowSeconds, 0)),
        spendEvidence("zec", "refund", nowSeconds, 1),
      );
      announcement = "Two ZEC refund reports agree. Policy qualification is still required.";
    }
  } else if (phase === "refund-recovery" && state.zec.phase === "refund-seen") {
    const qualifiedAt = state.zec.spendAttestations!.reduce(
      (latest, item) => item.observedAtSeconds > latest ? item.observedAtSeconds : latest,
      0n,
    );
    nextState = confirmSwapSpend(state, "zec", state.zec.spend!.factId, qualifiedAt);
    announcement = "Refunded. No asset moved.";
  }

  return {
    session: { ...session, state: nextState, nowSeconds: nextTime },
    announcement,
  };
}

export function nativeSwapPhaseCopy(session: NativeSwapFixtureSession) {
  return settlementPhaseCopy(session);
}

export function nativeSwapEvidence(session: NativeSwapFixtureSession) {
  return settlementEvidence(session);
}

export const nativeSwapFixtureTerms = fixtureTerms;
