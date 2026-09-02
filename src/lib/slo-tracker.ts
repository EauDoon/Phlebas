// SLO tracker. The tracker is a pure function over a state
// record; the tracker never reaches out to the network and never
// signs a transaction. The tracker computes the rolling-window
// compliance for a service against a target SLO. The tracker is
// the building block for the operations hardening surface.

export type SloTarget = Readonly<{
  service: string;
  metric: "availability" | "latency_p95_ms" | "latency_p99_ms";
  windowSeconds: bigint;
  /**
   * For `availability`, the fraction of samples that must succeed, so a
   * value in [0, 1]. For a latency metric, the bound each sample's
   * `value` is measured against, in milliseconds.
   */
  threshold: number;
  /**
   * The direction a sample has to satisfy the threshold in. `le` is a
   * ceiling, `ge` a floor. A latency target is normally a ceiling.
   */
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

/**
 * The fraction of in-window samples a latency target requires, read from
 * the percentile in the metric's own name. "p95 under two seconds" means
 * 95 percent of the samples, so the objective fraction cannot also be the
 * millisecond threshold.
 */
const LATENCY_OBJECTIVE_RATIO: Readonly<Record<string, number>> = {
  latency_p95_ms: 0.95,
  latency_p99_ms: 0.99,
};

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

function satisfies(sample: SloSample, target: SloTarget): boolean {
  // An availability sample carries its own verdict. A latency sample
  // carries a duration, and the target says which side of the threshold
  // that duration has to fall on. Reading `success` for a latency metric
  // would let the caller decide its own compliance and would leave both
  // `value` and `comparison` doing nothing at all.
  if (target.metric === "availability") return sample.success;
  return target.comparison === "le" ? sample.value <= target.threshold : sample.value >= target.threshold;
}

/**
 * The fraction of in-window samples that satisfy the target. This is not
 * the verdict on its own: compare it against `objectiveRatio`.
 */
export function complianceRatio(state: SloState, target: SloTarget, nowSeconds: bigint): number {
  const key = target.service + ":" + target.metric;
  const samples = state[key] ?? [];
  if (samples.length === 0) return 1;
  const cutoff = nowSeconds - target.windowSeconds;
  const inWindow = samples.filter((s) => s.observedAt >= cutoff);
  if (inWindow.length === 0) return 1;
  const satisfyingCount = inWindow.filter((s) => satisfies(s, target)).length;
  return satisfyingCount / inWindow.length;
}

/**
 * The fraction of samples the target requires. An availability target
 * states that fraction directly as its threshold; a latency target states
 * a millisecond bound instead, so the required fraction has to come from
 * the percentile in the metric name.
 */
export function objectiveRatio(target: SloTarget): number {
  if (target.metric === "availability") {
    if (!Number.isFinite(target.threshold) || target.threshold < 0 || target.threshold > 1) {
      throw new RangeError("An availability threshold must be a fraction between 0 and 1");
    }
    return target.threshold;
  }
  const ratio = LATENCY_OBJECTIVE_RATIO[target.metric];
  if (ratio === undefined) throw new RangeError("Unknown SLO metric: " + target.metric);
  if (!Number.isFinite(target.threshold) || target.threshold < 0) {
    throw new RangeError("A latency threshold must be a non-negative number of milliseconds");
  }
  return ratio;
}

export function meetsSlo(state: SloState, target: SloTarget, nowSeconds: bigint): boolean {
  return complianceRatio(state, target, nowSeconds) >= objectiveRatio(target);
}

export function sloVerdict(state: SloState, target: SloTarget, nowSeconds: bigint): Readonly<{
  service: string;
  metric: SloTarget["metric"];
  ratio: number;
  threshold: number;
  objectiveRatio: number;
  meets: boolean;
  sampleCount: number;
}> {
  const objective = objectiveRatio(target);
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
      objectiveRatio: objective,
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
    objectiveRatio: objective,
    meets: ratio >= objective,
    sampleCount: inWindow.length,
  };
}
