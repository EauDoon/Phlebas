import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  applyDiagnosticTransition,
  diagnosticStateOf,
  emptyDiagnosticFill,
  isDiagnosticTerminal,
  projectedDiagnosticNextStep,
  type DiagnosticFill,
} from "./swap-fill-projection.ts";

const FILL_ID = "0x1111111111111111111111111111111111111111111111111111111111111111" as DiagnosticFill["fillId"];

function makeFill(): DiagnosticFill {
  return emptyDiagnosticFill(FILL_ID, 1_000n, 2_000n);
}

test("projection starts as proposed and observation-only", () => {
  const fill = makeFill();
  assert.equal(diagnosticStateOf(fill), "proposed");
  assert.equal(isDiagnosticTerminal(diagnosticStateOf(fill)), false);
  assert.equal(projectedDiagnosticNextStep(fill, 0n), "observe-evm-funding");
});

test("projection follows the observed happy path", () => {
  let fill = makeFill();
  fill = applyDiagnosticTransition(fill, "evm-leg-funded", 100n);
  assert.equal(projectedDiagnosticNextStep(fill, 100n), "observe-zec-funding");
  fill = applyDiagnosticTransition(fill, "zec-leg-funded", 200n);
  assert.equal(projectedDiagnosticNextStep(fill, 200n), "observe-zec-spend");
  fill = applyDiagnosticTransition(fill, "zec-leg-claimed", 300n);
  assert.equal(projectedDiagnosticNextStep(fill, 300n), "observe-evm-spend");
  fill = applyDiagnosticTransition(fill, "evm-leg-claimed", 400n);
  assert.equal(diagnosticStateOf(fill), "settled");
  assert.equal(projectedDiagnosticNextStep(fill, 400n), "observe-terminal");
});

test("projection exposes timeout observations without wallet instructions", () => {
  let fill = applyDiagnosticTransition(makeFill(), "evm-leg-funded", 100n);
  assert.equal(projectedDiagnosticNextStep(fill, 1_000n), "observe-evm-timeout");
  fill = applyDiagnosticTransition(fill, "zec-leg-funded", 200n);
  assert.equal(projectedDiagnosticNextStep(fill, 2_000n), "observe-zec-timeout");
});

test("projection disputes stop at an observation state", () => {
  const fill = applyDiagnosticTransition(makeFill(), "mark-disputed", 100n);
  assert.equal(diagnosticStateOf(fill), "disputed");
  assert.equal(projectedDiagnosticNextStep(fill, 100n), "observe-dispute");
});

test("projection rejects invalid refund timing", () => {
  assert.throws(() => emptyDiagnosticFill(FILL_ID, 2_000n, 1_000n), /strictly earlier/);
  assert.throws(() => emptyDiagnosticFill(FILL_ID, -1n, 1_000n), /non-negative/);
});
