import type { MarketId } from "@/lib/market-data";
import {
  ETHEREUM_MAINNET_NETWORK,
  ETHEREUM_MAINNET_USDC_ASSET,
} from "@/lib/mainnet-assets";
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
import { swapStateRoot } from "@/lib/swap-root";
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
  type SwapPhase,
  type SwapState,
} from "@/lib/swap-state";

export type NativeSwapScenario =
  | "happy"
  | "refund"
  | "stale"
  | "conflict"
  | "reorganization"
  | "contract-mismatch";

export type NativeSwapFixtureSession = Readonly<{
  marketId: "ZEC/USDC";
  scenario: NativeSwapScenario;
  state: SwapState;
  nowSeconds: bigint;
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
const fixtureQuoteChain = ETHEREUM_MAINNET_NETWORK;

const fixtureMarketPolicy: SwapMarketPolicyV1 = {
  version: 1,
  markets: [{
    zecChain: fixtureZecChain,
    zecAsset: `${fixtureZecChain}/slip44:133`,
    quoteChain: fixtureQuoteChain,
    quoteAsset: ETHEREUM_MAINNET_USDC_ASSET,
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
  quoteAsset: ETHEREUM_MAINNET_USDC_ASSET,
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
    return flagSwapDispute(funded, "semantic-mismatch", "Observed contract identity differs from the signed fixture terms.");
  }
  const claim = spendEvidence("evm", "claim", fixtureTerms.evmClaimSafetyCutoff);
  const revealed = observeSwapSpend(funded, claim);
  return retractSwapEvidence(revealed, claim.attestation.evidenceId, "The fixture EVM claim left the canonical chain.");
}

export function createNativeSwapFixture(
  marketId: MarketId,
  scenario: NativeSwapScenario = "happy",
): NativeSwapFixture {
  if (marketId === "ZEC/USDT") {
    return {
      availability: "disabled",
      marketId,
      reason: "The exact Ethereum Mainnet USDT identity is defined, but its matcher and per-fill lock remain undeployed. No USDT wallet action is available.",
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
  const { state, scenario, nowSeconds } = session;
  const phase = swapPhase(state);
  if (phase === "disputed") {
    return {
      label: "Fixture action disabled",
      enabled: false,
      disabledReason: "Evidence is unsafe or conflicting. Funding and claim controls remain disabled.",
    };
  }
  if (phase === "settled" || phase === "refunded") {
    return { label: phase === "settled" ? "Fixture settled" : "Fixture refunded", enabled: false };
  }
  if (phase === "awaiting-authorizations") return { label: "Accept exact fixture terms", enabled: true };
  if (phase === "awaiting-zec-funding") {
    return {
      label: state.zec.phase === "unfunded" ? "Prepare fixture ZEC lock" : "Record fixture ZEC funding",
      enabled: true,
    };
  }
  if (phase === "awaiting-zec-confirmation") return { label: "Confirm fixture ZEC evidence", enabled: true };
  if (phase === "awaiting-evm-funding") {
    return {
      label: state.evm.phase === "unfunded" ? "Prepare fixture USDC lock" : "Record fixture USDC funding",
      enabled: true,
    };
  }
  if (phase === "awaiting-evm-confirmation") return { label: "Confirm fixture USDC evidence", enabled: true };
  if (phase === "awaiting-evm-claim" && scenario === "refund") {
    const deadlines = swapDeadlineStatus(state.terms, nowSeconds);
    return {
      label: deadlines.evmRefundEligible ? "Record fixture USDC refund" : "Advance fixture to USDC refund deadline",
      enabled: true,
    };
  }
  if (phase === "awaiting-evm-claim") return { label: "Record fixture USDC claim", enabled: true };
  if (phase === "secret-observed") return { label: "Confirm fixture USDC claim", enabled: true };
  if (phase === "awaiting-zec-claim") {
    return {
      label: state.zec.phase === "funded-confirmed" ? "Record fixture ZEC claim" : "Confirm fixture ZEC claim",
      enabled: true,
    };
  }
  if (phase === "refund-recovery") {
    if (state.evm.phase === "refund-seen") return { label: "Confirm fixture USDC refund", enabled: true };
    if (state.zec.phase === "funded-confirmed") {
      const deadlines = swapDeadlineStatus(state.terms, nowSeconds);
      return {
        label: deadlines.zecRefundEligible ? "Record fixture ZEC refund" : "Advance fixture to ZEC refund deadline",
        enabled: true,
      };
    }
    if (state.zec.phase === "refund-seen") return { label: "Confirm fixture ZEC refund", enabled: true };
  }
  return {
    label: "Fixture action disabled",
    enabled: false,
    disabledReason: "No safe fixture transition is available from this state.",
  };
}

export function advanceNativeSwapFixture(session: NativeSwapFixtureSession): Readonly<{
  session: NativeSwapFixtureSession;
  announcement: string;
}> {
  const { state, scenario, nowSeconds } = session;
  const phase = swapPhase(state);
  let nextState = state;
  let nextTime = nowSeconds;
  let announcement = "Fixture state unchanged.";

  if (phase === "awaiting-authorizations") {
    const zecAuthorized = authorizeSwapTerms(state, state.terms.zecSellerId, state.termsHash, nowSeconds);
    nextState = authorizeSwapTerms(zecAuthorized, state.terms.stablecoinSellerId, state.termsHash, nowSeconds + 1n);
    announcement = "Exact fixture terms accepted. ZEC lock preparation is now available.";
  } else if (phase === "awaiting-zec-funding" && state.zec.phase === "unfunded") {
    nextState = prepareSwapFunding(state, "zec", hex32("61"), state.terms.zecFundBy - 1n);
    announcement = "Fixture ZEC lock prepared. No transaction was built or signed.";
  } else if (phase === "awaiting-zec-funding" && state.zec.phase === "funding-prepared") {
    nextState = observeSwapFunding(observeSwapFunding(state, fundingEvidence("zec", 0)), fundingEvidence("zec", 1));
    announcement = "Two fixture ZEC observer reports agree. Policy qualification is still required.";
  } else if (phase === "awaiting-zec-confirmation") {
    const evidence = fundingEvidence("zec", 0);
    nextState = confirmSwapFunding(state, "zec", evidence.fact.factId, evidence.attestation.observedAtSeconds);
    announcement = "Fixture ZEC evidence confirmed. Stablecoin lock preparation is now available.";
  } else if (phase === "awaiting-evm-funding" && state.evm.phase === "unfunded") {
    nextState = prepareSwapFunding(state, "evm", hex32("62"), state.terms.evmFundBy - 1n);
    announcement = "Fixture USDC lock prepared. No transaction was built or signed.";
  } else if (phase === "awaiting-evm-funding" && state.evm.phase === "funding-prepared") {
    nextState = observeSwapFunding(observeSwapFunding(state, fundingEvidence("evm", 0)), fundingEvidence("evm", 1));
    announcement = "Two fixture USDC observer reports agree. Policy qualification is still required.";
  } else if (phase === "awaiting-evm-confirmation") {
    const evidence = fundingEvidence("evm", 0);
    nextState = confirmSwapFunding(state, "evm", evidence.fact.factId, evidence.attestation.observedAtSeconds);
    announcement = scenario === "refund"
      ? "Both fixture locks are funded. The refund deadline has not passed."
      : "Both fixture locks are funded. The fixture USDC claim is now available.";
  } else if (phase === "awaiting-evm-claim" && scenario === "refund") {
    const deadlines = swapDeadlineStatus(state.terms, nowSeconds);
    if (!deadlines.evmRefundEligible) {
      nextTime = state.terms.evmRefundTime;
      announcement = "Fixture clock advanced to the USDC refund deadline. No chain time changed.";
    } else {
      nextState = observeSwapSpend(
        observeSwapSpend(state, spendEvidence("evm", "refund", nowSeconds, 0)),
        spendEvidence("evm", "refund", nowSeconds, 1),
      );
      announcement = "Two fixture USDC refund reports agree. Policy qualification is still required.";
    }
  } else if (phase === "awaiting-evm-claim") {
    const executedAt = state.terms.evmClaimSafetyCutoff;
    nextState = observeSwapSpend(
      observeSwapSpend(state, spendEvidence("evm", "claim", executedAt, 0)),
      spendEvidence("evm", "claim", executedAt, 1),
    );
    announcement = "Fixture USDC claim evidence recorded. The shared preimage is now visible in this fixture.";
  } else if (phase === "secret-observed") {
    const evidence = state.evm.spend!;
    const qualifiedAt = state.evm.spendAttestations!.reduce(
      (latest, item) => item.observedAtSeconds > latest ? item.observedAtSeconds : latest,
      0n,
    );
    nextState = confirmSwapSpend(state, "evm", evidence.factId, qualifiedAt);
    announcement = "Fixture USDC claim confirmed. The fixture ZEC claim is now available.";
  } else if (phase === "awaiting-zec-claim" && state.zec.phase === "funded-confirmed") {
    const executedAt = state.terms.zecRefundTime - 1n;
    nextState = observeSwapSpend(
      observeSwapSpend(state, spendEvidence("zec", "claim", executedAt, 0)),
      spendEvidence("zec", "claim", executedAt, 1),
    );
    announcement = "Fixture ZEC claim evidence recorded. Confirmation is still required.";
  } else if (phase === "awaiting-zec-claim" && state.zec.phase === "claim-seen") {
    const qualifiedAt = state.zec.spendAttestations!.reduce(
      (latest, item) => item.observedAtSeconds > latest ? item.observedAtSeconds : latest,
      0n,
    );
    nextState = confirmSwapSpend(state, "zec", state.zec.spend!.factId, qualifiedAt);
    announcement = "Fixture settled. No asset moved.";
  } else if (phase === "refund-recovery" && state.evm.phase === "refund-seen") {
    const qualifiedAt = state.evm.spendAttestations!.reduce(
      (latest, item) => item.observedAtSeconds > latest ? item.observedAtSeconds : latest,
      0n,
    );
    nextState = confirmSwapSpend(state, "evm", state.evm.spend!.factId, qualifiedAt);
    announcement = "Fixture USDC refund confirmed. ZEC remains locked until its later fixture deadline.";
  } else if (phase === "refund-recovery" && state.zec.phase === "funded-confirmed") {
    const deadlines = swapDeadlineStatus(state.terms, nowSeconds);
    if (!deadlines.zecRefundEligible) {
      nextTime = state.terms.zecRefundTime;
      announcement = "Fixture clock advanced to the ZEC refund deadline. No chain time changed.";
    } else {
      nextState = observeSwapSpend(
        observeSwapSpend(state, spendEvidence("zec", "refund", nowSeconds, 0)),
        spendEvidence("zec", "refund", nowSeconds, 1),
      );
      announcement = "Two fixture ZEC refund reports agree. Policy qualification is still required.";
    }
  } else if (phase === "refund-recovery" && state.zec.phase === "refund-seen") {
    const qualifiedAt = state.zec.spendAttestations!.reduce(
      (latest, item) => item.observedAtSeconds > latest ? item.observedAtSeconds : latest,
      0n,
    );
    nextState = confirmSwapSpend(state, "zec", state.zec.spend!.factId, qualifiedAt);
    announcement = "Fixture refunded. No asset moved.";
  }

  return {
    session: { ...session, state: nextState, nowSeconds: nextTime },
    announcement,
  };
}

export function nativeSwapPhaseCopy(session: NativeSwapFixtureSession): Readonly<{
  phase: SwapPhase;
  title: string;
  body: string;
  stage: number;
}> {
  const { state, scenario, nowSeconds } = session;
  const phase = swapPhase(state);
  if (phase === "disputed") {
    return {
      phase,
      title: "Disputed fixture evidence",
      body: state.disputes.at(-1)?.detail ?? "Fixture evidence is unsafe.",
      stage: 4,
    };
  }
  if (phase === "awaiting-authorizations") {
    return { phase, title: "Matched fixture", body: "A match is not settlement. Review the immutable fixture terms.", stage: 0 };
  }
  if (phase === "awaiting-zec-funding") {
    return {
      phase,
      title: state.zec.phase === "unfunded" ? "Terms accepted" : "ZEC lock prepared",
      body: state.zec.phase === "unfunded"
        ? "The native ZEC leg uses the later refund deadline."
        : "No transaction was built or signed.",
      stage: 1,
    };
  }
  if (phase === "awaiting-zec-confirmation") {
    return { phase, title: "ZEC funding observed", body: "Waiting for approved Zcash confirmation evidence.", stage: 2 };
  }
  if (phase === "awaiting-evm-funding") {
    return {
      phase,
      title: state.evm.phase === "unfunded" ? "ZEC funding confirmed" : "USDC lock prepared",
      body: state.evm.phase === "unfunded"
        ? "The stablecoin leg remains unfunded."
        : "Contract identity and deadline policy remain bound to the fixture terms.",
      stage: 3,
    };
  }
  if (phase === "awaiting-evm-confirmation") {
    return { phase, title: "USDC funding observed", body: "Waiting for fixture EVM confirmation evidence.", stage: 3 };
  }
  if (phase === "awaiting-evm-claim") {
    const refundEligible = swapDeadlineStatus(state.terms, nowSeconds).evmRefundEligible;
    if (scenario === "refund") {
      return {
        phase,
        title: refundEligible ? "USDC refund available" : "Both fixture locks funded",
        body: refundEligible
          ? "The fixture USDC refund deadline has passed. Claim and refund are mutually exclusive."
          : "Both fixture locks are funded. Neither leg is settled, and refund remains early.",
        stage: 4,
      };
    }
    return { phase, title: "Both fixture locks funded", body: "Both fixture locks are funded. Neither leg is settled.", stage: 4 };
  }
  if (phase === "secret-observed") {
    return { phase, title: "Shared preimage observed", body: "The fixture USDC claim revealed the shared preimage.", stage: 4 };
  }
  if (phase === "awaiting-zec-claim") {
    return {
      phase,
      title: state.zec.phase === "funded-confirmed" ? "USDC claim confirmed" : "ZEC claim observed",
      body: state.zec.phase === "funded-confirmed"
        ? "The canonical fixture preimage can now satisfy the ZEC lock."
        : "Waiting for fixture Zcash claim confirmation.",
      stage: 4,
    };
  }
  if (phase === "refund-recovery") {
    const zecEligible = swapDeadlineStatus(state.terms, nowSeconds).zecRefundEligible;
    return {
      phase,
      title: state.evm.phase === "refund-seen"
        ? "USDC refund observed"
        : state.zec.phase === "refund-seen"
          ? "ZEC refund observed"
          : zecEligible
            ? "ZEC refund available"
            : "USDC refund confirmed",
      body: state.zec.phase === "refund-seen"
        ? "Waiting for fixture Zcash refund confirmation."
        : zecEligible
          ? "The later fixture ZEC refund deadline has passed."
          : "ZEC remains locked until its later fixture refund deadline.",
      stage: 4,
    };
  }
  if (phase === "settled") return { phase, title: "Fixture settled", body: "Fixture journey complete. No asset moved.", stage: 5 };
  if (phase === "expired") return { phase, title: "Fixture expired", body: "No chain funding was observed before the signed deadline.", stage: 5 };
  return { phase, title: "Fixture refunded", body: "Fixture refund complete. No transaction was submitted.", stage: 5 };
}

export function nativeSwapEvidence(session: NativeSwapFixtureSession) {
  const { state } = session;
  return {
    swapId: state.swapId,
    termsHash: state.termsHash,
    stateRoot: swapStateRoot(state),
    domainPhase: swapPhase(state),
    zecLeg: state.zec.phase,
    evmLeg: state.evm.phase,
    observerEvidence: state.disputes.length > 0 ? "unsafe" : "fixture only",
  } as const;
}

export const nativeSwapFixtureTerms = fixtureTerms;
