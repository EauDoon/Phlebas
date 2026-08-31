import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SimulationFrame } from "@/components/simulation-frame";
import { SwapPreimagePanel } from "@/components/swap-state-panel.tsx";
import { isValidPreimage } from "@/lib/preimage.ts";
import {
  emptyFill,
  isTerminal,
  nextAction,
  stateOf,
  type Fill,
  type FillState,
  type LegState,
} from "@/lib/swap-state.ts";

export const metadata: Metadata = {
  title: "Atomic swap state",
  description:
    "No-value state machine for one native ZEC atomic swap. Read-only. Signing and broadcast remain gated.",
  robots: { index: false, follow: false },
};

const LEG_STATES: ReadonlySet<LegState> = new Set(["pending", "funded", "claimed", "refunded"]);
const FILL_STATES: ReadonlySet<FillState> = new Set([
  "proposed",
  "awaiting-zec-fund",
  "awaiting-zec-claim",
  "awaiting-evm-claim",
  "settled",
  "evm-refundable",
  "zec-refundable",
  "evm-refunded",
  "zec-refunded",
  "fully-refunded",
  "disputed",
]);
type Role = "buyer" | "seller" | "watcher";

function parseLeg(value: string | undefined, fallback: LegState): LegState {
  if (value && LEG_STATES.has(value as LegState)) return value as LegState;
  return fallback;
}

function parseFillId(value: string | undefined): Hex32 | null {
  if (!value) return null;
  return isValidPreimage(value) ? (value as Hex32) : null;
}

function parseState(value: string | undefined): FillState | null {
  if (!value) return null;
  return FILL_STATES.has(value as FillState) ? (value as FillState) : null;
}

function parseRole(value: string | undefined): Role {
  if (value === "buyer" || value === "seller" || value === "watcher") return value;
  return "buyer";
}

function parseSeconds(value: string | undefined, fallback: bigint): bigint {
  if (!value) return fallback;
  try {
    const parsed = BigInt(value);
    if (parsed < 0n) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

type Hex32 = `0x${string}`;

function buildFill(params: {
  fillId: Hex32;
  evmState: LegState;
  zecState: LegState;
  evmRefundAfter: bigint;
  zecRefundAfter: bigint;
  fillState: FillState | null;
}): Fill {
  const base = emptyFill(params.fillId, params.evmRefundAfter, params.zecRefundAfter);
  let fill: Fill = { ...base, evmLeg: { state: params.evmState, observedAt: 0n }, zecLeg: { state: params.zecState, observedAt: 0n } };
  if (params.fillState === "disputed") {
    fill = { ...fill, disputed: true };
  }
  return fill;
}

const STATE_LABELS: Readonly<Record<FillState, string>> = {
  "proposed": "Proposed",
  "awaiting-zec-fund": "EVM funded, waiting for ZEC fund",
  "awaiting-zec-claim": "Both funded, waiting for ZEC claim",
  "awaiting-evm-claim": "ZEC claimed, waiting for EVM claim",
  "settled": "Settled",
  "evm-refundable": "EVM refund deadline passed",
  "zec-refundable": "ZEC refund deadline passed",
  "evm-refunded": "EVM leg refunded",
  "zec-refunded": "ZEC leg refunded",
  "fully-refunded": "Both legs refunded",
  "disputed": "Disputed",
};

const ACTION_LABELS: Readonly<Record<string, string>> = {
  "halt": "Halt — fill is disputed",
  "done": "Done",
  "fund-evm": "Lock the stablecoin on the EVM leg",
  "wait-for-evm-fund": "Wait for the buyer to lock the stablecoin on the EVM leg",
  "fund-zec": "Lock ZEC on the ZEC leg",
  "wait-for-zec-fund": "Wait for the seller to lock ZEC on the ZEC leg",
  "claim-zec": "Reveal the preimage by claiming ZEC",
  "wait-for-zec-claim": "Wait for the buyer to reveal the preimage on ZEC",
  "claim-evm": "Claim the EVM leg with the revealed preimage",
  "wait-for-evm-claim": "Wait for the seller to claim the EVM leg",
  "refund-evm": "Refund the EVM leg",
  "wait-for-evm-refund": "Wait for the EVM leg to be refunded",
  "refund-zec": "Refund the ZEC leg",
  "wait-for-zec-refund": "Wait for the ZEC leg to be refunded",
  "observe": "Observe",
  "observe-evm-timeout": "EVM leg refund deadline has passed",
  "observe-zec-timeout": "ZEC leg refund deadline has passed",
  "wait": "Wait",
};

function formatUnix(seconds: bigint): string {
  if (seconds === 0n) return "no deadline";
  return new Date(Number(seconds) * 1000).toISOString();
}

export default async function SwapPage({
  searchParams,
}: {
  searchParams: Promise<{
    fill?: string | string[];
    evm?: string | string[];
    zec?: string | string[];
    evmRefund?: string | string[];
    zecRefund?: string | string[];
    role?: string | string[];
    state?: string | string[];
    now?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const fillId = parseFillId(Array.isArray(params.fill) ? params.fill[0] : params.fill);
  if (!fillId) {
    notFound();
  }
  const evmState = parseLeg(Array.isArray(params.evm) ? params.evm[0] : params.evm, "pending");
  const zecState = parseLeg(Array.isArray(params.zec) ? params.zec[0] : params.zec, "pending");
  const evmRefundAfter = parseSeconds(
    Array.isArray(params.evmRefund) ? params.evmRefund[0] : params.evmRefund,
    1_000_000n,
  );
  const zecRefundAfter = parseSeconds(
    Array.isArray(params.zecRefund) ? params.zecRefund[0] : params.zecRefund,
    2_000_000n,
  );
  const role = parseRole(Array.isArray(params.role) ? params.role[0] : params.role);
  const fillState = parseState(Array.isArray(params.state) ? params.state[0] : params.state);
  const nowSeconds = parseSeconds(
    Array.isArray(params.now) ? params.now[0] : params.now,
    0n,
  );

  const fill = buildFill({
    fillId: fillId as Hex32,
    evmState,
    zecState,
    evmRefundAfter,
    zecRefundAfter,
    fillState,
  });

  const state = stateOf(fill);
  const terminal = isTerminal(state);
  const buyerAction = nextAction(fill, nowSeconds, "buyer");
  const sellerAction = nextAction(fill, nowSeconds, "seller");
  const watcherAction = nextAction(fill, nowSeconds, "watcher");

  return (
    <SimulationFrame
      title="Atomic swap state"
      skipTo={{ href: "#swap-state-ledger", label: "Skip to swap state" }}
    >
      <p data-testid="swap-simulation-notice">
        This is a no-value simulation of the atomic swap state machine. The preimage,
        the hash, the deadlines, and the next action are derived from URL parameters. No
        wallet, no signature, and no broadcast happen on this page.
      </p>

      <dl id="swap-state-ledger" tabIndex={-1} role="list" aria-label="Swap state ledger">
        <div role="listitem">
          <dt>Fill id</dt>
          <dd>
            <code data-testid="swap-fill-id">{fillId}</code>
          </dd>
        </div>
        <div role="listitem">
          <dt>State</dt>
          <dd data-testid="swap-state">
            {STATE_LABELS[state]} ({state})
          </dd>
        </div>
        <div role="listitem">
          <dt>EVM leg</dt>
          <dd data-testid="swap-evm-leg">{evmState}</dd>
        </div>
        <div role="listitem">
          <dt>ZEC leg</dt>
          <dd data-testid="swap-zec-leg">{zecState}</dd>
        </div>
        <div role="listitem">
          <dt>EVM refund deadline</dt>
          <dd>{formatUnix(evmRefundAfter)}</dd>
        </div>
        <div role="listitem">
          <dt>ZEC refund deadline</dt>
          <dd>{formatUnix(zecRefundAfter)}</dd>
        </div>
        <div role="listitem">
          <dt>Terminal</dt>
          <dd>{terminal ? "yes" : "no"}</dd>
        </div>
      </dl>

      <h2>Next action</h2>
      <ul role="list" aria-label="Next action by role">
        <li role="listitem">
          <strong>Buyer:</strong> <span data-testid="swap-action-buyer">{ACTION_LABELS[buyerAction] ?? buyerAction}</span>
        </li>
        <li role="listitem">
          <strong>Seller:</strong> <span data-testid="swap-action-seller">{ACTION_LABELS[sellerAction] ?? sellerAction}</span>
        </li>
        <li role="listitem">
          <strong>Watcher:</strong> <span data-testid="swap-action-watcher">{ACTION_LABELS[watcherAction] ?? watcherAction}</span>
        </li>
      </ul>

      <h2>Preimage</h2>
      <SwapPreimagePanel />

      <h2>Replay this state</h2>
      <p>
        Append the URL parameters to reproduce this view:
        <code data-testid="swap-replay-query">
          {`?fill=${fillId}&evm=${evmState}&zec=${zecState}&evmRefund=${evmRefundAfter}&zecRefund=${zecRefundAfter}&state=${state}`}
        </code>
      </p>
      <p>
        The current viewer role is <strong data-testid="swap-role">{role}</strong>. This is
        a read-only view. Action buttons are no-value simulation controls.
      </p>
    </SimulationFrame>
  );
}
