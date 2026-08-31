// In-memory metrics counter. The counter is a pure function over
// an in-memory state record; the counter never reaches out to the
// network and never signs a transaction. The counter is the
// building block for the operations hardening surface. The counter
// is deterministic for a fixed sequence of operations.

export type Counter = Readonly<{
  name: string;
  help: string;
  values: Readonly<Record<string, bigint>>;
}>;

export type MetricsState = Readonly<Record<string, Counter>>;

export function emptyMetricsState(): MetricsState {
  return {};
}

export function defineCounter(state: MetricsState, name: string, help: string): MetricsState {
  if (name.length === 0) throw new RangeError("Counter name must be non-empty");
  if (help.length === 0) throw new RangeError("Counter help must be non-empty");
  if (state[name]) return state;
  return { ...state, [name]: { name, help, values: {} } };
}

export function incCounter(state: MetricsState, name: string, labels: Readonly<Record<string, string>> = {}, by: bigint = 1n): MetricsState {
  if (by < 0n) throw new RangeError("Counter increment must be non-negative");
  const counter = state[name];
  if (!counter) throw new RangeError("Counter not defined: " + name);
  const key = formatLabels(labels);
  const next = (counter.values[key] ?? 0n) + by;
  return {
    ...state,
    [name]: { ...counter, values: { ...counter.values, [key]: next } },
  };
}

export function readCounter(state: MetricsState, name: string, labels: Readonly<Record<string, string>> = {}): bigint {
  const counter = state[name];
  if (!counter) return 0n;
  return counter.values[formatLabels(labels)] ?? 0n;
}

function formatLabels(labels: Readonly<Record<string, string>>): string {
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return "";
  return keys.map((k) => k + "=" + labels[k]).join(",");
}

export function renderPrometheusText(state: MetricsState): string {
  const lines: string[] = [];
  for (const counter of Object.values(state)) {
    lines.push("# HELP " + counter.name + " " + counter.help);
    lines.push("# TYPE " + counter.name + " counter");
    for (const [labels, value] of Object.entries(counter.values)) {
      const suffix = labels.length === 0 ? "" : "{" + labels + "}";
      lines.push(counter.name + suffix + " " + value.toString());
    }
  }
  return lines.join("\n") + "\n";
}
