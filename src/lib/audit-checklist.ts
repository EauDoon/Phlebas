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

export function parseAuditChecklistRows(markdown: string): ReadonlyArray<ParsedAuditChecklistRow> {
  return markdown.split(/\r?\n/)
    .filter((line) => line.trim().startsWith("|") && !/^\|\s*-/.test(line.trim()))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim().toLowerCase()))
    .filter((cells) => cells.length === 5 && cells[0] !== "id")
    .map((cells) => ({ id: cells[0], required: cells[2] === "yes", status: cells[4] }));
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
