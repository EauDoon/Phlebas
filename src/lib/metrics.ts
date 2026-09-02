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
  if (!METRIC_NAME.test(name)) throw new RangeError("Counter name is not a Prometheus metric name: " + name);
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

/** Prometheus metric names. A colon is reserved for recording rules. */
const METRIC_NAME = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
/** Prometheus label names. No colon: that is reserved for metric names. */
const LABEL_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Escape a label value for the Prometheus text exposition format, which
 * requires a double-quoted value with backslash, double quote and line
 * feed escaped.
 */
function escapeLabelValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

/**
 * Canonical key for a label set, already in exposition syntax.
 *
 * The quoting is not cosmetic. Rendering `k=v` unquoted produces a body
 * no scraper accepts, and without escaping, a value carrying `}` and a
 * line feed closes the label list and starts a line of its own, so a
 * label taken from a request could write arbitrary samples into the
 * scrape. Quoting also separates label sets that would otherwise collide:
 * {a: "b,c=d"} and {a: "b", c: "d"} both flattened to `a=b,c=d` and were
 * counted as one series.
 */
function formatLabels(labels: Readonly<Record<string, string>>): string {
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return "";
  return keys.map((key) => {
    if (!LABEL_NAME.test(key)) throw new RangeError("Label name is not a Prometheus label name: " + key);
    return `${key}="${escapeLabelValue(labels[key] ?? "")}"`;
  }).join(",");
}

export function renderPrometheusText(state: MetricsState): string {
  const lines: string[] = [];
  for (const counter of Object.values(state)) {
    // HELP text runs to the end of the line, so a line feed inside it
    // would split one comment into a comment and a garbage sample.
    lines.push("# HELP " + counter.name + " " + counter.help.replace(/\\/g, "\\\\").replace(/\n/g, "\\n"));
    lines.push("# TYPE " + counter.name + " counter");
    for (const [labels, value] of Object.entries(counter.values)) {
      const suffix = labels.length === 0 ? "" : "{" + labels + "}";
      lines.push(counter.name + suffix + " " + value.toString());
    }
  }
  return lines.join("\n") + "\n";
}
