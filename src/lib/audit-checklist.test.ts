import { strict as assert } from "node:assert";
import { test } from "node:test";

import { addItem, blockedItems, emptyAuditChecklist, incompleteRequiredItems } from "./audit-checklist.ts";

const item = (id: string, required: boolean, status: "todo" | "in-progress" | "done" | "blocked") => ({
  id,
  category: "contracts" as const,
  description: "x",
  required,
  owner: "security",
  status,
});

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
