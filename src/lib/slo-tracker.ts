// SLO tracker. The tracker is a pure function over a state
// record; the tracker never reaches out to the network and never
// signs a transaction. The tracker computes the rolling-window
// compliance for a service against a target SLO. The tracker is
// the building block for the operations hardening surface.

export type SloTarget = Readonly<{
  service: string;
  metric: "availability" | "latency_p95_ms" | "latency_p99_ms";
  windowSeconds: bigint;
  threshold: number;
  comparison: "le" | "ge";
}>;

export type SloSample = Readonly<{
  service: string;
  metric: SloTarget["metric"];
  observedAt: bigint;
  value: number;
  success: boolean;
}>;

export type SloState = Readonly<Record<string, ReadonlyArray<SloSample>>>;

export function emptySloState(): SloState {
  return {};
}

export function recordSample(state: SloState, sample: SloSample, maxSamples: bigint = 10_000n): SloState {
  if (sample.observedAt < 0n) throw new RangeError("Sample time must be non-negative");
  const key = sample.service + ":" + sample.metric;
  const existing = state[key] ?? [];
  const next = [...existing, sample];
  while (next.length > maxSamples) next.shift();
  return { ...state, [key]: next };
}

export function complianceRatio(state: SloState, target: SloTarget, nowSeconds: bigint): number {
  const key = target.service + ":" + target.metric;
  const samples = state[key] ?? [];
  if (samples.length === 0) return 1;
  const cutoff = nowSeconds - target.windowSeconds;
  const inWindow = samples.filter((s) => s.observedAt >= cutoff);
  if (inWindow.length === 0) return 1;
  const successCount = inWindow.filter((s) => s.success).length;
  return successCount / inWindow.length;
}

export function meetsSlo(state: SloState, target: SloTarget, nowSeconds: bigint): boolean {
  return complianceRatio(state, target, nowSeconds) >= target.threshold;
}

export function sloVerdict(state: SloState, target: SloTarget, nowSeconds: bigint): Readonly<{
  service: string;
  metric: SloTarget["metric"];
  ratio: number;
  threshold: number;
  meets: boolean;
  sampleCount: number;
}> {
  const key = target.service + ":" + target.metric;
  const samples = state[key] ?? [];
  const cutoff = nowSeconds - target.windowSeconds;
  const inWindow = samples.filter((s) => s.observedAt >= cutoff);
  if (inWindow.length === 0) {
    return {
      service: target.service,
      metric: target.metric,
      ratio: 1,
      threshold: target.threshold,
      meets: true,
      sampleCount: 0,
    };
  }
  const ratio = complianceRatio(state, target, nowSeconds);
  return {
    service: target.service,
    metric: target.metric,
    ratio,
    threshold: target.threshold,
    meets: ratio >= target.threshold,
    sampleCount: inWindow.length,
  };
}
