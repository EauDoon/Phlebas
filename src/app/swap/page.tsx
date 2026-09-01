import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SimulationFrame } from "@/components/simulation-frame";
import { SwapPreimagePanel } from "@/components/swap-state-panel.tsx";
import { isValidPreimage } from "@/lib/preimage.ts";
import {
  diagnosticStateOf,
  emptyDiagnosticFill,
  isDiagnosticTerminal,
  projectedDiagnosticNextStep,
  type DiagnosticFill,
  type DiagnosticFillState,
  type DiagnosticLegState,
} from "@/lib/swap-fill-projection.ts";

export const metadata: Metadata = {
  title: "Historical fill-event projection",
  description:
    "Untrusted historical fill-event projection. Read-only. Signing and broadcast remain gated. Not live settlement.",
  robots: { index: false, follow: false },
};

const LEG_STATES: ReadonlySet<DiagnosticLegState> = new Set(["pending", "funded", "claimed", "refunded"]);
const FILL_STATES: ReadonlySet<DiagnosticFillState> = new Set([
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

function parseLeg(value: string | undefined, fallback: DiagnosticLegState): DiagnosticLegState {
  if (value && LEG_STATES.has(value as DiagnosticLegState)) return value as DiagnosticLegState;
  return fallback;
}

function parseFillId(value: string | undefined): Hex32 | null {
  if (!value) return null;
  return isValidPreimage(value) ? (value as Hex32) : null;
}

function parseState(value: string | undefined): DiagnosticFillState | null {
  if (!value) return null;
  return FILL_STATES.has(value as DiagnosticFillState) ? (value as DiagnosticFillState) : null;
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
  evmState: DiagnosticLegState;
  zecState: DiagnosticLegState;
  evmRefundAfter: bigint;
  zecRefundAfter: bigint;
  fillState: DiagnosticFillState | null;
}): DiagnosticFill {
  const base = emptyDiagnosticFill(params.fillId, params.evmRefundAfter, params.zecRefundAfter);
  let fill: DiagnosticFill = { ...base, evmLeg: { state: params.evmState, observedAt: 0n }, zecLeg: { state: params.zecState, observedAt: 0n } };
  if (params.fillState === "disputed") {
    fill = { ...fill, disputed: true };
  }
  return fill;
}

const STATE_LABELS: Readonly<Record<DiagnosticFillState, string>> = {
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

const OBSERVATION_LABELS: Readonly<Record<string, string>> = {
  "observe-dispute": "Dispute recorded. Verify the canonical journal before proceeding.",
  "observe-evm-funding": "Waiting for an EVM funding observation",
  "observe-zec-funding": "Waiting for a Zcash funding observation",
  "observe-zec-spend": "Waiting for a Zcash spend observation",
  "observe-evm-spend": "Waiting for an EVM spend observation",
  "observe-evm-timeout": "EVM leg refund deadline has passed",
  "observe-zec-timeout": "ZEC leg refund deadline has passed",
  "observe-terminal": "The historical fill-event projection is terminal",
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

  const state = diagnosticStateOf(fill);
  const terminal = isDiagnosticTerminal(state);
  const observation = projectedDiagnosticNextStep(fill, nowSeconds);

  return (
    <SimulationFrame
      title="Historical fill-event projection"
      skipTo={{ href: "#swap-state-ledger", label: "Skip to swap state" }}
    >
      <p data-testid="swap-simulation-notice">
        This is an untrusted, retired historical fill-event projection built from URL
        parameters. It is read-only and not live settlement. It is not the signed
        SwapState, it does not verify a SwapJournal, and it cannot authorize a wallet
        action. Signing and broadcast remain gated. No wallet, signature, or broadcast
        happens on this page.
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

      <h2>Observation status</h2>
      <p data-testid="swap-observation">
        {OBSERVATION_LABELS[observation] ?? observation}
      </p>

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
        a read-only historical projection. It exposes no action controls.
      </p>
    </SimulationFrame>
  );
}
