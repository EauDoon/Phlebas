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

test("B and S map to side when no dialog or review is open", () => {
  assert.equal(interpretTicketKey("b", idle), "buy");
  assert.equal(interpretTicketKey("S", idle), "sell");
  assert.equal(interpretTicketKey("b", { target: null, dialogOpen: true, reviewOpen: false }), null);
  assert.equal(interpretTicketKey("s", { target: null, dialogOpen: true, reviewOpen: false }), null);
  assert.equal(interpretTicketKey("b", { target: null, dialogOpen: false, reviewOpen: true }), null);
  assert.equal(interpretTicketKey("s", { target: null, dialogOpen: false, reviewOpen: true }), null);
});

test("L and M set order type when review is closed", () => {
  assert.equal(interpretTicketKey("l", idle), "limit");
  assert.equal(interpretTicketKey("M", idle), "market");
  assert.equal(interpretTicketKey("l", { target: null, dialogOpen: false, reviewOpen: true }), null);
  assert.equal(interpretTicketKey("m", { target: null, dialogOpen: true, reviewOpen: false }), null);
});

test("ticket shortcuts ignore open dialogs and typing targets", () => {
  assert.equal(interpretTicketKey("i", { target: null, dialogOpen: true, reviewOpen: false }), null);
  assert.equal(interpretTicketKey("g", { target: null, dialogOpen: true, reviewOpen: false }), null);
  const input = { tagName: "INPUT", isContentEditable: false } as unknown as EventTarget;
  assert.equal(interpretTicketKey("f", { target: input, dialogOpen: false, reviewOpen: false }), null);
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
  const select = { tagName: "SELECT", isContentEditable: false } as unknown as EventTarget;
  const textarea = { tagName: "TEXTAREA", isContentEditable: false } as unknown as EventTarget;
  const editable = { tagName: "DIV", isContentEditable: true } as unknown as EventTarget;
  assert.equal(interpretTicketKey("b", { target: select, dialogOpen: false, reviewOpen: false }), null);
  assert.equal(interpretTicketKey("s", { target: textarea, dialogOpen: false, reviewOpen: false }), null);
  assert.equal(interpretTicketKey("g", { target: editable, dialogOpen: false, reviewOpen: false }), null);
});

test("modifier chords do not fire B S G I F", () => {
  assert.equal(interpretTicketKey("b", { ...idle, ctrlKey: true }), null);
  assert.equal(interpretTicketKey("s", { ...idle, altKey: true }), null);
  assert.equal(interpretTicketKey("g", { ...idle, metaKey: true }), null);
  assert.equal(interpretTicketKey("Escape", { ...idle, ctrlKey: true }), "escape");
});
