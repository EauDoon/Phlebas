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
