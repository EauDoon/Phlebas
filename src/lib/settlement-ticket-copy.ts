import { swapDeadlineStatus } from "./swap-policy.ts";
import { swapStateRoot } from "./swap-root.ts";
import {
  swapPhase,
  type SwapPhase,
  type SwapState,
} from "./swap-state.ts";

export type SettlementTicketScenario =
  | "happy"
  | "refund"
  | "stale"
  | "conflict"
  | "reorganization"
  | "contract-mismatch";

export type SettlementTicketSession = Readonly<{
  state: SwapState;
  scenario: SettlementTicketScenario;
  nowSeconds: bigint;
}>;

export type SettlementTicketAction = Readonly<{
  label: string;
  enabled: boolean;
  kind: "fund" | "claim" | "refund" | "idle";
  disabledReason?: string;
  fundingDisabled: boolean;
  claimDisabled: boolean;
  refundPathVisible: boolean;
}>;

export const ZEC_P2SH_LOCK_LABEL = "ZEC P2SH lock";
export const EXACT_TOKEN_EVM_LOCK_LABEL = "Exact-token EVM lock";
export const CLAIM_REFUND_EXCLUSIVE = "Claim and refund are mutually exclusive.";
export const SETTLEMENT_MATCHER_HONESTY =
  "The matcher can sequence or omit orders. It cannot move funds. It is not trustless.";
export const UNSAFE_EVIDENCE_DISABLES_CLAIM =
  "Unsafe evidence disables funding and claim. The refund path stays visible.";
export const PROTOCOL_FEE_ZERO = "Protocol fee 0";

export const SETTLEMENT_PROGRESS_STEPS = [
  ["01", "Terms", "Review the exact fill terms"],
  ["02", ZEC_P2SH_LOCK_LABEL, "Fund first. Longer refund deadline."],
  ["03", "ZEC finality", "Confirm approved Zcash evidence"],
  ["04", EXACT_TOKEN_EVM_LOCK_LABEL, "Fund second. Shorter refund deadline."],
  ["05", "Claim or refund", CLAIM_REFUND_EXCLUSIVE],
  ["06", "Complete", "Settled or refunded"],
] as const;

export const USDT_SETTLEMENT_DISABLED = {
  title: "USDT identity unresolved",
  reason: "USDT settlement is disabled until one exact network and token contract is approved. USDT0 is abandoned.",
  headline: "USDT is not USDT0.",
  body: "Network, token contract, decimals, and settlement policy must bind one exact asset identity.",
} as const;

export function settlementLockCopy() {
  return {
    zec: {
      label: ZEC_P2SH_LOCK_LABEL,
      order: "first",
      refund: "longer refund deadline",
      detail: `${ZEC_P2SH_LOCK_LABEL} first. Longer refund deadline.`,
    },
    evm: {
      label: EXACT_TOKEN_EVM_LOCK_LABEL,
      order: "second",
      refund: "shorter refund deadline",
      detail: `${EXACT_TOKEN_EVM_LOCK_LABEL} second. Shorter refund deadline.`,
    },
  } as const;
}

export function formatSettlementTime(value: bigint): string {
  return `${value.toString()} unix seconds`;
}

export function settlementUnsafeDisablesClaim(state: SwapState): boolean {
  return swapPhase(state) === "disputed" || state.disputes.length > 0;
}

export function settlementRefundPathVisible(): boolean {
  return true;
}

export function settlementTicketAction(session: SettlementTicketSession): SettlementTicketAction {
  const { state, scenario, nowSeconds } = session;
  const phase = swapPhase(state);
  const refundPathVisible = true;
  if (phase === "disputed" || settlementUnsafeDisablesClaim(state)) {
    return {
      label: "Claim disabled",
      enabled: false,
      kind: "claim",
      disabledReason: UNSAFE_EVIDENCE_DISABLES_CLAIM,
      fundingDisabled: true,
      claimDisabled: true,
      refundPathVisible,
    };
  }
  if (phase === "settled" || phase === "refunded") {
    return {
      label: phase === "settled" ? "Settled" : "Refunded",
      enabled: false,
      kind: "idle",
      fundingDisabled: true,
      claimDisabled: true,
      refundPathVisible,
    };
  }
  if (phase === "awaiting-authorizations") {
    return {
      label: "Accept exact terms",
      enabled: true,
      kind: "fund",
      fundingDisabled: false,
      claimDisabled: true,
      refundPathVisible,
    };
  }
  if (phase === "awaiting-zec-funding") {
    return {
      label: state.zec.phase === "unfunded" ? `Prepare ${ZEC_P2SH_LOCK_LABEL}` : "Record ZEC funding",
      enabled: true,
      kind: "fund",
      fundingDisabled: false,
      claimDisabled: true,
      refundPathVisible,
    };
  }
  if (phase === "awaiting-zec-confirmation") {
    return {
      label: "Confirm ZEC evidence",
      enabled: true,
      kind: "fund",
      fundingDisabled: false,
      claimDisabled: true,
      refundPathVisible,
    };
  }
  if (phase === "awaiting-evm-funding") {
    return {
      label: state.evm.phase === "unfunded" ? `Prepare ${EXACT_TOKEN_EVM_LOCK_LABEL}` : "Record USDC funding",
      enabled: true,
      kind: "fund",
      fundingDisabled: false,
      claimDisabled: true,
      refundPathVisible,
    };
  }
  if (phase === "awaiting-evm-confirmation") {
    return {
      label: "Confirm USDC evidence",
      enabled: true,
      kind: "fund",
      fundingDisabled: false,
      claimDisabled: true,
      refundPathVisible,
    };
  }
  if (phase === "awaiting-evm-claim" && scenario === "refund") {
    const deadlines = swapDeadlineStatus(state.terms, nowSeconds);
    return {
      label: deadlines.evmRefundEligible ? "Record USDC refund" : "Advance to USDC refund deadline",
      enabled: true,
      kind: "refund",
      fundingDisabled: true,
      claimDisabled: true,
      refundPathVisible,
    };
  }
  if (phase === "awaiting-evm-claim") {
    return {
      label: "Record USDC claim",
      enabled: true,
      kind: "claim",
      fundingDisabled: true,
      claimDisabled: false,
      refundPathVisible,
    };
  }
  if (phase === "secret-observed") {
    return {
      label: "Confirm USDC claim",
      enabled: true,
      kind: "claim",
      fundingDisabled: true,
      claimDisabled: false,
      refundPathVisible,
    };
  }
  if (phase === "awaiting-zec-claim") {
    return {
      label: state.zec.phase === "funded-confirmed" ? "Record ZEC claim" : "Confirm ZEC claim",
      enabled: true,
      kind: "claim",
      fundingDisabled: true,
      claimDisabled: false,
      refundPathVisible,
    };
  }
  if (phase === "refund-recovery") {
    if (state.evm.phase === "refund-seen") {
      return {
        label: "Confirm USDC refund",
        enabled: true,
        kind: "refund",
        fundingDisabled: true,
        claimDisabled: true,
        refundPathVisible,
      };
    }
    if (state.zec.phase === "funded-confirmed") {
      const deadlines = swapDeadlineStatus(state.terms, nowSeconds);
      return {
        label: deadlines.zecRefundEligible ? "Record ZEC refund" : "Advance to ZEC refund deadline",
        enabled: true,
        kind: "refund",
        fundingDisabled: true,
        claimDisabled: true,
        refundPathVisible,
      };
    }
    if (state.zec.phase === "refund-seen") {
      return {
        label: "Confirm ZEC refund",
        enabled: true,
        kind: "refund",
        fundingDisabled: true,
        claimDisabled: true,
        refundPathVisible,
      };
    }
  }
  return {
    label: "Claim disabled",
    enabled: false,
    kind: "idle",
    disabledReason: "No safe transition is available from this state.",
    fundingDisabled: true,
    claimDisabled: true,
    refundPathVisible,
  };
}

export function settlementPhaseCopy(session: SettlementTicketSession): Readonly<{
  phase: SwapPhase;
  title: string;
  body: string;
  stage: number;
}> {
  const { state, scenario, nowSeconds } = session;
  const phase = swapPhase(state);
  const locks = settlementLockCopy();
  if (phase === "disputed") {
    return {
      phase,
      title: "Disputed evidence",
      body: state.disputes.at(-1)?.detail ?? UNSAFE_EVIDENCE_DISABLES_CLAIM,
      stage: 4,
    };
  }
  if (phase === "awaiting-authorizations") {
    return {
      phase,
      title: "Matched fill",
      body: "A match is not settlement. Review the immutable fill terms.",
      stage: 0,
    };
  }
  if (phase === "awaiting-zec-funding") {
    return {
      phase,
      title: state.zec.phase === "unfunded" ? "Terms accepted" : `${ZEC_P2SH_LOCK_LABEL} prepared`,
      body: state.zec.phase === "unfunded"
        ? locks.zec.detail
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
      title: state.evm.phase === "unfunded" ? "ZEC funding confirmed" : `${EXACT_TOKEN_EVM_LOCK_LABEL} prepared`,
      body: state.evm.phase === "unfunded"
        ? "The stablecoin leg remains unfunded."
        : "Contract identity and deadline policy remain bound to the signed terms.",
      stage: 3,
    };
  }
  if (phase === "awaiting-evm-confirmation") {
    return { phase, title: "USDC funding observed", body: "Waiting for EVM confirmation evidence.", stage: 3 };
  }
  if (phase === "awaiting-evm-claim") {
    const refundEligible = swapDeadlineStatus(state.terms, nowSeconds).evmRefundEligible;
    if (scenario === "refund") {
      return {
        phase,
        title: refundEligible ? "USDC refund available" : "Both locks funded",
        body: refundEligible
          ? `The USDC refund deadline has passed. ${CLAIM_REFUND_EXCLUSIVE}`
          : `Both locks are funded. Neither leg is settled, and refund remains early. ${CLAIM_REFUND_EXCLUSIVE}`,
        stage: 4,
      };
    }
    return {
      phase,
      title: "Both locks funded",
      body: `Both locks are funded. Neither leg is settled. ${CLAIM_REFUND_EXCLUSIVE}`,
      stage: 4,
    };
  }
  if (phase === "secret-observed") {
    return { phase, title: "Shared preimage observed", body: "The USDC claim revealed the shared preimage.", stage: 4 };
  }
  if (phase === "awaiting-zec-claim") {
    return {
      phase,
      title: state.zec.phase === "funded-confirmed" ? "USDC claim confirmed" : "ZEC claim observed",
      body: state.zec.phase === "funded-confirmed"
        ? "The canonical preimage can now satisfy the ZEC P2SH lock."
        : "Waiting for Zcash claim confirmation.",
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
        ? "Waiting for Zcash refund confirmation."
        : zecEligible
          ? "The later ZEC refund deadline has passed."
          : "ZEC remains locked until its later refund deadline.",
      stage: 4,
    };
  }
  if (phase === "settled") return { phase, title: "Settled", body: "Fill complete. No asset moved.", stage: 5 };
  if (phase === "expired") {
    return { phase, title: "Expired", body: "No chain funding was observed before the signed deadline.", stage: 5 };
  }
  return { phase, title: "Refunded", body: "Refund complete. No transaction was submitted.", stage: 5 };
}

export function settlementEvidence(session: SettlementTicketSession) {
  const { state } = session;
  return {
    swapId: state.swapId,
    termsHash: state.termsHash,
    stateRoot: swapStateRoot(state),
    domainPhase: swapPhase(state),
    zecLeg: state.zec.phase,
    evmLeg: state.evm.phase,
    observerEvidence: settlementUnsafeDisablesClaim(state) ? "unsafe" : "qualified",
    protocolFeeQuoteAtoms: state.terms.protocolFeeQuoteAtoms,
  } as const;
}

export function settlementTermsRows(state: SwapState): readonly Readonly<{
  label: string;
  value: string;
  code?: boolean;
}>[] {
  const locks = settlementLockCopy();
  return [
    { label: "Exchange", value: "1.00000000 transparent ZEC for 52.910000 USDC" },
    { label: "Protocol fee", value: PROTOCOL_FEE_ZERO },
    { label: locks.zec.label, value: `${locks.zec.order}, ${locks.zec.refund}` },
    { label: locks.evm.label, value: `${locks.evm.order}, ${locks.evm.refund}` },
    { label: "Zcash network", value: state.terms.zecChain, code: true },
    { label: "EVM network", value: state.terms.quoteChain, code: true },
    { label: "USDC identity", value: state.terms.quoteAsset, code: true },
    { label: "EVM escrow", value: state.terms.evmEscrowContract, code: true },
    { label: "Shared hash", value: state.terms.secretHash, code: true },
  ];
}
