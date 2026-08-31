import assert from "node:assert/strict";
import test from "node:test";

import { interpretTicketKey } from "./ticket-shortcuts.ts";

const idle = { target: null, dialogOpen: false, reviewOpen: false };

test("G I F set time in force when review is closed", () => {
  assert.equal(interpretTicketKey("g", idle), "gtc");
  assert.equal(interpretTicketKey("I", idle), "ioc");
  assert.equal(interpretTicketKey("f", idle), "fok");
  assert.equal(interpretTicketKey("b", idle), "buy");
});

test("review-and-confirm swallows G I F until Escape", () => {
  const review = { target: null, dialogOpen: false, reviewOpen: true };
  assert.equal(interpretTicketKey("i", review), null);
  assert.equal(interpretTicketKey("G", review), null);
  assert.equal(interpretTicketKey("Escape", review), "escape");
});

test("open dialogs and typing targets ignore shortcuts", () => {
  assert.equal(interpretTicketKey("i", { target: null, dialogOpen: true, reviewOpen: false }), null);
  assert.equal(interpretTicketKey("Escape", { target: null, dialogOpen: true, reviewOpen: false }), null);
  const typingTarget = { tagName: "INPUT", isContentEditable: false } as unknown as EventTarget;
  assert.equal(interpretTicketKey("i", {
    target: typingTarget,
    dialogOpen: false,
    reviewOpen: false,
  }), null);
});
