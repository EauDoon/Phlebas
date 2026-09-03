import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  addItem,
  blockedItems,
  CANONICAL_REQUIRED_AUDIT_IDS,
  emptyAuditChecklist,
  evaluateAuditChecklistRows,
  incompleteRequiredItems,
  parseAuditChecklistRows,
} from "./audit-checklist.ts";

const canonicalMarkdown = readFileSync(new URL("../../docs/audit/audit-checklist.md", import.meta.url), "utf8");

const item = (id: string, required: boolean, status: "todo" | "in-progress" | "done" | "blocked") => ({
  id,
  category: "contracts" as const,
  description: "x",
  required,
  owner: "security",
  status,
});

function replaceRowCell(markdown: string, id: string, cellIndex: number, value: string): string {
  let replacements = 0;
  const updated = markdown.split(/\r?\n/).map((line) => {
    const cells = line.split("|");
    if (cells.length === 7 && cells[1]?.trim().toLowerCase() === id) {
      cells[cellIndex + 1] = ` ${value} `;
      replacements += 1;
      return cells.join("|");
    }
    return line;
  }).join("\n");
  assert.equal(replacements, 1);
  return updated;
}

function removeRow(markdown: string, id: string): string {
  let removals = 0;
  const updated = markdown.split(/\r?\n/).filter((line) => {
    const cells = line.split("|");
    if (cells.length === 7 && cells[1]?.trim().toLowerCase() === id) {
      removals += 1;
      return false;
    }
    return true;
  }).join("\n");
  assert.equal(removals, 1);
  return updated;
}

test("incompleteRequiredItems returns required items that are not done", () => {
  let c = emptyAuditChecklist();
  c = addItem(c, item("a", true, "done"));
  c = addItem(c, item("b", true, "todo"));
  c = addItem(c, item("c", false, "todo"));
  const out = incompleteRequiredItems(c);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "b");
});

test("blockedItems returns blocked items", () => {
  let c = emptyAuditChecklist();
  c = addItem(c, item("a", true, "blocked"));
  c = addItem(c, item("b", true, "done"));
  const out = blockedItems(c);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "a");
});

test("addItem appends without mutating the input", () => {
  const original = emptyAuditChecklist();
  const next = addItem(original, item("a", true, "todo"));
  assert.equal(original.length, 0);
  assert.equal(next.length, 1);
});

test("markdown parsing cannot cancel a required todo with an optional done row", () => {
  const rows = parseAuditChecklistRows(`
| ID | Item | Required | Owner | Status |
| --- | --- | --- | --- | --- |
| required-1 | required item | yes | security | todo |
| optional-1 | optional item | no | security | done |
`);
  assert.deepEqual(rows, [
    { id: "required-1", required: true, status: "todo" },
    { id: "optional-1", required: false, status: "done" },
  ]);
  assert.deepEqual(rows.filter((row) => row.required && row.status !== "done").map((row) => row.id), ["required-1"]);
});

test("the tracked checklist has the fixed 47-item audit surface", () => {
  assert.equal(CANONICAL_REQUIRED_AUDIT_IDS.length, 47);
  const rows = parseAuditChecklistRows(canonicalMarkdown);
  assert.deepEqual(evaluateAuditChecklistRows(rows).status, "fail");
  assert.match(evaluateAuditChecklistRows(rows).detail, /required items not done/);
});

test("a completed fixture passes the canonical checklist gate", () => {
  const completed = canonicalMarkdown.split(/\r?\n/).map((line) => {
    const cells = line.split("|");
    const id = cells[1]?.trim().toLowerCase();
    if (cells.length === 7 && id && CANONICAL_REQUIRED_AUDIT_IDS.includes(id as typeof CANONICAL_REQUIRED_AUDIT_IDS[number])) {
      cells[5] = " done ";
      return cells.join("|");
    }
    return line;
  }).join("\n");
  assert.deepEqual(evaluateAuditChecklistRows(parseAuditChecklistRows(completed)), {
    status: "pass",
    detail: "all canonical required items done",
  });
});

test("removing, renaming, or duplicating a canonical row fails the gate", () => {
  const removed = evaluateAuditChecklistRows(parseAuditChecklistRows(removeRow(canonicalMarkdown, "contracts-10")));
  assert.equal(removed.status, "fail");
  assert.match(removed.detail, /missing required items: contracts-10/);

  const renamed = evaluateAuditChecklistRows(parseAuditChecklistRows(
    replaceRowCell(canonicalMarkdown, "services-1", 0, "services-renamed"),
  ));
  assert.equal(renamed.status, "fail");
  assert.match(renamed.detail, /missing required items: services-1/);

  const duplicated = evaluateAuditChecklistRows(parseAuditChecklistRows(
    replaceRowCell(canonicalMarkdown, "services-1", 0, "contracts-1"),
  ));
  assert.equal(duplicated.status, "fail");
  assert.match(duplicated.detail, /duplicate item IDs: contracts-1/);
});

test("downgrading a canonical required marker fails closed", () => {
  const no = evaluateAuditChecklistRows(parseAuditChecklistRows(
    replaceRowCell(canonicalMarkdown, "contracts-10", 2, "no"),
  ));
  assert.equal(no.status, "fail");
  assert.match(no.detail, /canonical items are not required: contracts-10/);

  assert.throws(
    () => parseAuditChecklistRows(replaceRowCell(canonicalMarkdown, "contracts-10", 2, "maybe")),
    /malformed Required marker/,
  );
});

test("malformed checklist statuses fail during parsing", () => {
  assert.throws(
    () => parseAuditChecklistRows(replaceRowCell(canonicalMarkdown, "contracts-10", 4, "pending")),
    /malformed Status/,
  );
});
