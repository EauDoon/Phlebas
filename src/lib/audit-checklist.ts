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
  status: "todo" | "in-progress" | "done" | "blocked";
}>;

export type AuditChecklist = ReadonlyArray<AuditItem>;

export type ParsedAuditChecklistRow = Readonly<{
  id: string;
  required: boolean;
  status: string;
}>;

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
      return cells;
    })
    .filter((cells) => cells[0] !== "id")
    .map((cells) => ({ id: cells[0]!, required: cells[2] === "yes", status: cells[4]! }));
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
