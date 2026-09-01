// Release readiness gate. The gate is a pure function over a
// collection of gate results; the gate never reaches out to the
// network and never signs a transaction. The gate is the
// fail-closed evidence summary for whether the project is ready
// to enter a separately authorized production release. The gate
// is deterministic for a fixed collection of gate results.

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

export const REQUIRED_RELEASE_GATES = [
  "lint",
  "contract-format",
  "typecheck",
  "tests",
  "manifests",
  "contract-build",
  "secret-scan",
  "build",
  "contracts",
  "audit-checklist",
] as const;

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
  const counts = new Map<string, number>();
  for (const gate of gates) counts.set(gate.name, (counts.get(gate.name) ?? 0) + 1);
  const missing = REQUIRED_RELEASE_GATES.filter((name) => !counts.has(name));
  const duplicated = [...counts].filter(([, count]) => count !== 1).map(([name]) => name);
  return {
    ready: missing.length === 0 && duplicated.length === 0 && failing.length === 0 && skipped.length === 0,
    passing,
    failing: [
      ...failing,
      ...missing.map((name) => `missing:${name}`),
      ...duplicated.map((name) => `duplicate:${name}`),
    ],
    skipped,
    generatedAt: nowSeconds,
  };
}

export function emptyGateResult(name: string, status: GateStatus, detail: string): GateResult {
  return { name, status, detail };
}
