// Skip-nav restore helper. The helper computes the CSS class
// string for a given skip-nav state. The helper is a pure
// function; the helper never reaches out to the network and never
// signs a transaction. The helper is consumed by the skip-nav
// controller and is also used by the accessibility test suite.

import type { SkipNavState } from "./skip-nav-state.ts";

export function skipNavClass(state: SkipNavState): string {
  if (state === "visible") return "skip-nav--visible";
  if (state === "hidden-after-activation") return "skip-nav--hidden-after-activation";
  return "skip-nav--hidden";
}
