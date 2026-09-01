// Skip-nav state machine. The state machine is a pure function
// over a state record; the state machine never reaches out to
// the network and never signs a transaction. The state machine
// is the building block for the skip-nav controller in
// `src/lib/use-skip-nav-controller.ts` and is also used by
// the accessibility test suite.

export type SkipNavState = "hidden" | "visible" | "hidden-after-activation";

export type SkipNavEvent =
  | { kind: "click" }
  | { kind: "focusin" }
  | { kind: "keydown"; key: string };

export function nextSkipNavState(current: SkipNavState, event: SkipNavEvent): SkipNavState {
  if (event.kind === "click") return "hidden-after-activation";
  if (event.kind === "focusin") return "visible";
  if (event.kind === "keydown" && event.key === "Escape") return "hidden-after-activation";
  return current;
}

export function isSkipNavVisible(state: SkipNavState): boolean {
  return state !== "hidden";
}
