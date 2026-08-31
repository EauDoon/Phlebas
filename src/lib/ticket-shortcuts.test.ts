import assert from "node:assert/strict";
import test from "node:test";

import { interpretTicketKey } from "./ticket-shortcuts.ts";

test("G I F map to time in force when no dialog is open", () => {
  assert.equal(interpretTicketKey("g", { target: null, dialogOpen: false }), "gtc");
  assert.equal(interpretTicketKey("I", { target: null, dialogOpen: false }), "ioc");
  assert.equal(interpretTicketKey("f", { target: null, dialogOpen: false }), "fok");
  assert.equal(interpretTicketKey("Escape", { target: null, dialogOpen: false }), "escape");
});

test("ticket shortcuts ignore open dialogs and typing targets", () => {
  assert.equal(interpretTicketKey("i", { target: null, dialogOpen: true }), null);
  assert.equal(interpretTicketKey("g", { target: null, dialogOpen: true }), null);
  const input = { tagName: "INPUT", isContentEditable: false } as unknown as EventTarget;
  assert.equal(interpretTicketKey("f", { target: input, dialogOpen: false }), null);
});
