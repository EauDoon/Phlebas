// Audit checklist. The checklist is a pure data structure; the
// checklist is the canonical record of the audit surface for the
// project. The checklist is consumed by the release readiness
// gate and the audit prep runbook.

export type AuditItem = Readonly<{
  id: string;
  category: "contracts" | "services" | "operations" | "documentation" | "key-management";
  description: string;
  required: boolean;
  owner: string;
  status: AuditStatus;
}>;

export type AuditChecklist = ReadonlyArray<AuditItem>;

export type AuditStatus = "todo" | "in-progress" | "done" | "blocked";

export type ParsedAuditChecklistRow = Readonly<{
  id: string;
  required: boolean;
  status: AuditStatus;
}>;

export type AuditChecklistGateResult = Readonly<{
  status: "pass" | "fail";
  detail: string;
}>;

/** The tracked audit surface is fixed until this list is deliberately reviewed. */
export const CANONICAL_REQUIRED_AUDIT_IDS = Object.freeze([
  // Contracts
  "contracts-1", "contracts-2", "contracts-3", "contracts-4", "contracts-5",
  "contracts-6", "contracts-7", "contracts-8", "contracts-9", "contracts-10", "contracts-11",
  // Services
  "services-1", "services-2", "services-3", "services-4", "services-5", "services-6",
  "services-7", "services-8", "services-9", "services-10", "services-11", "services-12",
  // Operations
  "operations-1", "operations-2", "operations-3", "operations-4", "operations-5",
  "operations-6", "operations-7", "operations-8", "operations-9",
  // Documentation
  "docs-1", "docs-2", "docs-3", "docs-4", "docs-5", "docs-6", "docs-7",
  // Key management
  "keys-1", "keys-2", "keys-3", "keys-4", "keys-5", "keys-6",
  // Compliance
  "compliance-1", "compliance-2",
] as const);

const CANONICAL_REQUIRED_AUDIT_ID_SET = new Set<string>(CANONICAL_REQUIRED_AUDIT_IDS);
const AUDIT_STATUS_SET = new Set<AuditStatus>(["todo", "in-progress", "done", "blocked"]);

/**
 * Read the checklist table that `scripts/release-readiness.mjs` gates on.
 *
 * A row with the wrong number of cells raises rather than being dropped.
 * Dropping it was a fail-open: the gate passes when it finds no
 * incomplete required row, so one `|` inside a description cell split
 * that row into six and removed an unfinished, required item from the
 * gate's view entirely. Every row in the tracked checklist has five
 * cells, so insisting on five rejects nothing legitimate.
 */
export function parseAuditChecklistRows(markdown: string): ReadonlyArray<ParsedAuditChecklistRow> {
  return markdown.split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter(({ line }) => line.startsWith("|") && !/^\|\s*-/.test(line))
    .map(({ line, lineNumber }) => {
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim().toLowerCase());
      if (cells.length !== 5) {
        throw new RangeError(
          `Audit checklist row on line ${lineNumber} has ${cells.length} cells, expected 5. `
          + "A cell containing a pipe splits the row and would hide it from the release gate.",
        );
      }
      if (!cells[0]) throw new RangeError(`Audit checklist row on line ${lineNumber} has no item ID`);
      if (cells[0] === "id") return cells;
      if (cells[2] !== "yes" && cells[2] !== "no") {
        throw new RangeError(
          `Audit checklist row on line ${lineNumber} has malformed Required marker ${JSON.stringify(cells[2])}`,
        );
      }
      if (!AUDIT_STATUS_SET.has(cells[4] as AuditStatus)) {
        throw new RangeError(
          `Audit checklist row on line ${lineNumber} has malformed Status ${JSON.stringify(cells[4])}`,
        );
      }
      return cells;
    })
    .filter((cells) => cells[0] !== "id")
    .map((cells) => ({ id: cells[0]!, required: cells[2] === "yes", status: cells[4] as AuditStatus }));
}

/**
 * Evaluate parsed checklist evidence against the fixed release audit surface.
 * Missing, renamed, duplicated, or downgraded canonical rows fail closed.
 */
export function evaluateAuditChecklistRows(
  rows: ReadonlyArray<ParsedAuditChecklistRow>,
): AuditChecklistGateResult {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.id, (counts.get(row.id) ?? 0) + 1);

  const missing = CANONICAL_REQUIRED_AUDIT_IDS.filter((id) => !counts.has(id));
  const duplicated = [...counts]
    .filter(([, count]) => count !== 1)
    .map(([id]) => id);
  const downgraded = CANONICAL_REQUIRED_AUDIT_IDS.filter((id) => {
    const row = rows.find((candidate) => candidate.id === id);
    return row?.required !== true;
  });
  const unexpectedRequired = rows
    .filter((row) => row.required && !CANONICAL_REQUIRED_AUDIT_ID_SET.has(row.id))
    .map((row) => row.id);
  const incomplete = rows
    .filter((row) => CANONICAL_REQUIRED_AUDIT_ID_SET.has(row.id) && row.required && row.status !== "done")
    .map((row) => row.id);

  const failures = [
    ...(missing.length > 0 ? [`missing required items: ${missing.join(", ")}`] : []),
    ...(duplicated.length > 0 ? [`duplicate item IDs: ${duplicated.join(", ")}`] : []),
    ...(downgraded.length > 0 ? [`canonical items are not required: ${downgraded.join(", ")}`] : []),
    ...(unexpectedRequired.length > 0
      ? [`unexpected required items: ${[...new Set(unexpectedRequired)].join(", ")}`] : []),
    ...(incomplete.length > 0 ? [`required items not done: ${incomplete.join(", ")}`] : []),
  ];
  if (failures.length > 0) return { status: "fail", detail: failures.join("; ") };
  return { status: "pass", detail: "all canonical required items done" };
}

export function emptyAuditChecklist(): AuditChecklist {
  return [];
}

export function addItem(checklist: AuditChecklist, item: AuditItem): AuditChecklist {
  return [...checklist, item];
}

export function incompleteRequiredItems(checklist: AuditChecklist): ReadonlyArray<AuditItem> {
  return checklist.filter((i) => i.required && i.status !== "done");
}

export function blockedItems(checklist: AuditChecklist): ReadonlyArray<AuditItem> {
  return checklist.filter((i) => i.status === "blocked");
}
