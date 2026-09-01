import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  SwapStateError,
  emptyFill,
  isEvmRefundReady,
  isTerminal,
  nextAction,
  stateOf,
  transition,
  type Fill,
} from "./swap-state.ts";

const FILL_ID = "0x1111111111111111111111111111111111111111111111111111111111111111" as Fill["fillId"];

function makeFill(): Fill {
  return emptyFill(FILL_ID, 1_000_000n, 2_000_000n);
}

test("empty fill starts in proposed and is not terminal", () => {
  const fill = makeFill();
  assert.equal(stateOf(fill), "proposed");
  assert.equal(isTerminal(stateOf(fill)), false);
});

test("happy path: proposed -> awaiting-zec-fund -> awaiting-zec-claim -> awaiting-evm-claim -> settled", () => {
  let fill = makeFill();
  fill = transition(fill, "evm-leg-funded", 100n);
  assert.equal(stateOf(fill), "awaiting-zec-fund");
  fill = transition(fill, "zec-leg-funded", 200n);
  assert.equal(stateOf(fill), "awaiting-zec-claim");
  fill = transition(fill, "zec-leg-claimed", 300n);
  assert.equal(stateOf(fill), "awaiting-evm-claim");
  fill = transition(fill, "evm-leg-claimed", 400n);
  assert.equal(stateOf(fill), "settled");
  assert.equal(isTerminal(stateOf(fill)), true);
});

test("evm leg refundable after EVM deadline when funded", () => {
  let fill = makeFill();
  fill = transition(fill, "evm-leg-funded", 100n);
  assert.equal(isEvmRefundReady(fill, 999_999n), false);
  assert.equal(isEvmRefundReady(fill, 1_000_000n), true);
  fill = transition(fill, "evm-leg-refunded", 1_500_000n);
  assert.equal(stateOf(fill), "evm-refunded");
});

test("evm refund before deadline is rejected", () => {
  let fill = makeFill();
  fill = transition(fill, "evm-leg-funded", 100n);
  assert.throws(
    () => transition(fill, "evm-leg-refunded", 999_999n),
    (err: unknown) => err instanceof SwapStateError && err.kind === "evm-deadline-not-passed",
  );
});

test("zec refund after deadline without zec leg funded is rejected", () => {
  const fill = makeFill();
  assert.throws(
    () => transition(fill, "zec-leg-refunded", 2_000_000n),
    (err: unknown) => err instanceof SwapStateError && err.kind === "zec-leg-not-funded",
  );
});

test("zec refund after deadline when zec leg funded succeeds", () => {
  let fill = makeFill();
  fill = transition(fill, "evm-leg-funded", 100n);
  fill = transition(fill, "zec-leg-funded", 200n);
  fill = transition(fill, "zec-leg-refunded", 2_500_000n);
  assert.equal(stateOf(fill), "zec-refunded");
});

test("both legs refunded transitions to fully-refunded", () => {
  let fill = makeFill();
  fill = transition(fill, "evm-leg-funded", 100n);
  fill = transition(fill, "zec-leg-funded", 200n);
  fill = transition(fill, "evm-leg-refunded", 1_500_000n);
  assert.equal(stateOf(fill), "evm-refunded");
  fill = transition(fill, "zec-leg-refunded", 2_500_000n);
  assert.equal(stateOf(fill), "fully-refunded");
});

test("claim after refund is rejected", () => {
  let fill = makeFill();
  fill = transition(fill, "evm-leg-funded", 100n);
  fill = transition(fill, "evm-leg-refunded", 1_500_000n);
  assert.throws(
    () => transition(fill, "evm-leg-claimed", 1_600_000n),
    (err: unknown) => err instanceof SwapStateError && err.kind === "evm-leg-not-funded",
  );
});

test("refund after claim is rejected", () => {
  let fill = makeFill();
  fill = transition(fill, "evm-leg-funded", 100n);
  fill = transition(fill, "evm-leg-claimed", 200n);
  assert.throws(
    () => transition(fill, "evm-leg-refunded", 1_500_000n),
    (err: unknown) => err instanceof SwapStateError && err.kind === "evm-leg-not-funded",
  );
});

test("double fund on the same leg is rejected", () => {
  let fill = makeFill();
  fill = transition(fill, "evm-leg-funded", 100n);
  assert.throws(
    () => transition(fill, "evm-leg-funded", 200n),
    (err: unknown) => err instanceof SwapStateError && err.kind === "evm-already-claimed",
  );
});

test("disputed flag wins over every other state", () => {
  let fill = makeFill();
  fill = transition(fill, "evm-leg-funded", 100n);
  fill = transition(fill, "zec-leg-funded", 200n);
  fill = transition(fill, "mark-disputed", 300n);
  assert.equal(stateOf(fill), "disputed");
  assert.equal(isTerminal(stateOf(fill)), true);
});

test("disputed rejects every other transition", () => {
  let fill = makeFill();
  fill = transition(fill, "mark-disputed", 100n);
  assert.throws(
    () => transition(fill, "evm-leg-funded", 200n),
    (err: unknown) => err instanceof SwapStateError && err.kind === "fill-disputed",
  );
});

test("resolve-disputed clears the flag and resumes flow", () => {
  let fill = makeFill();
  fill = transition(fill, "mark-disputed", 100n);
  fill = transition(fill, "resolve-disputed", 200n);
  assert.equal(stateOf(fill), "proposed");
  fill = transition(fill, "evm-leg-funded", 300n);
  assert.equal(stateOf(fill), "awaiting-zec-fund");
});

test("next action for buyer in proposed is fund-evm", () => {
  const fill = makeFill();
  assert.equal(nextAction(fill, 0n, "buyer"), "fund-evm");
  assert.equal(nextAction(fill, 0n, "seller"), "wait-for-evm-fund");
  assert.equal(nextAction(fill, 0n, "watcher"), "observe");
});

test("next action for seller in awaiting-zec-fund is fund-zec", () => {
  let fill = makeFill();
  fill = transition(fill, "evm-leg-funded", 100n);
  assert.equal(nextAction(fill, 200n, "seller"), "fund-zec");
  assert.equal(nextAction(fill, 200n, "buyer"), "wait-for-zec-fund");
});

test("next action for buyer in awaiting-zec-claim is claim-zec", () => {
  let fill = makeFill();
  fill = transition(fill, "evm-leg-funded", 100n);
  fill = transition(fill, "zec-leg-funded", 200n);
  assert.equal(nextAction(fill, 300n, "buyer"), "claim-zec");
  assert.equal(nextAction(fill, 300n, "seller"), "wait-for-zec-claim");
});

test("next action for seller in awaiting-evm-claim is claim-evm", () => {
  let fill = makeFill();
  fill = transition(fill, "evm-leg-funded", 100n);
  fill = transition(fill, "zec-leg-funded", 200n);
  fill = transition(fill, "zec-leg-claimed", 300n);
  assert.equal(nextAction(fill, 400n, "seller"), "claim-evm");
  assert.equal(nextAction(fill, 400n, "buyer"), "wait-for-evm-claim");
});

test("next action for buyer when EVM leg is refundable is refund-evm", () => {
  let fill = makeFill();
  fill = transition(fill, "evm-leg-funded", 100n);
  assert.equal(nextAction(fill, 1_500_000n, "buyer"), "refund-evm");
});

test("next action for seller when ZEC leg is refundable is refund-zec", () => {
  let fill = makeFill();
  fill = transition(fill, "evm-leg-funded", 100n);
  fill = transition(fill, "zec-leg-funded", 200n);
  assert.equal(nextAction(fill, 2_500_000n, "seller"), "refund-zec");
});

test("next action for watcher on EVM timeout is observe-evm-timeout", () => {
  const fill = makeFill();
  assert.equal(nextAction(fill, 1_500_000n, "watcher"), "observe-evm-timeout");
});

test("constructor refuses EVM deadline later than ZEC deadline", () => {
  assert.throws(() => emptyFill(FILL_ID, 3_000_000n, 2_000_000n), /EVM refund deadline must be strictly earlier/);
});

test("constructor refuses negative deadlines", () => {
  assert.throws(() => emptyFill(FILL_ID, -1n, 100n), /non-negative/);
});

test("constructor refuses a malformed fill id", () => {
  assert.throws(
    () => emptyFill("0xnope" as Fill["fillId"], 1_000_000n, 2_000_000n),
    /32 bytes of hexadecimal/,
  );
});

test("terminal states are settled, fully-refunded, and disputed", () => {
  assert.equal(isTerminal("settled"), true);
  assert.equal(isTerminal("fully-refunded"), true);
  assert.equal(isTerminal("disputed"), true);
  assert.equal(isTerminal("proposed"), false);
  assert.equal(isTerminal("awaiting-zec-claim"), false);
});
