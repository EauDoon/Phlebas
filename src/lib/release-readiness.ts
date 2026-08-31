// Release readiness gate. The gate is a pure function over a
// collection of gate results; the gate never reaches out to the
// network and never signs a transaction. The gate is the
// single source of truth for whether the project is ready to
// ship to production. The gate is deterministic for a fixed
// collection of gate results.

export type GateStatus = "pass" | "fail" | "skip";

export type GateResult = Readonly<{
  name: string;
  status: GateStatus;
  detail: string;
}>;

export type ReleaseVerdict = Readonly<{
  ready: boolean;
  passing: ReadonlyArray<string>;
  failing: ReadonlyArray<string>;
  skipped: ReadonlyArray<string>;
  generatedAt: bigint;
}>;

export function evaluateReadiness(gates: ReadonlyArray<GateResult>, nowSeconds: bigint): ReleaseVerdict {
  if (nowSeconds < 0n) throw new RangeError("Now must be non-negative");
  const passing: string[] = [];
  const failing: string[] = [];
  const skipped: string[] = [];
  for (const g of gates) {
    if (g.status === "pass") passing.push(g.name);
    else if (g.status === "fail") failing.push(g.name);
    else if (g.status === "skip") skipped.push(g.name);
  }
  return {
    ready: failing.length === 0,
    passing,
    failing,
    skipped,
    generatedAt: nowSeconds,
  };
}

export function emptyGateResult(name: string, status: GateStatus, detail: string): GateResult {
  return { name, status, detail };
}
