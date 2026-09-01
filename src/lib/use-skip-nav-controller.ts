"use client";

import { useEffect, type RefObject } from "react";

import {
  nextSkipNavState,
  type SkipNavState,
} from "./skip-nav-state.ts";

// `useSkipNavController` wires the skip-nav state machine to a
// DOM element via a React ref. The hook is a thin DOM adapter.
// It never reaches out to the network and never signs a
// transaction. The state machine is the only place that decides
// the next state.
export function useSkipNavController(
  ref: RefObject<HTMLElement | null>,
  options: { initial?: SkipNavState } = {},
): void {
  const initial: SkipNavState = options.initial ?? "hidden";
  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    let state: SkipNavState = initial;
    const setState = (next: SkipNavState) => {
      if (next === state) return;
      state = next;
      nav.setAttribute("data-skip-nav-state", next);
    };
    const onClick = () => setState(nextSkipNavState(state, { kind: "click" }));
    const onFocusIn = () => setState(nextSkipNavState(state, { kind: "focusin" }));
    const onKeydown = (event: KeyboardEvent) => {
      setState(nextSkipNavState(state, { kind: "keydown", key: event.key }));
    };
    nav.addEventListener("click", onClick);
    nav.addEventListener("focusin", onFocusIn);
    nav.addEventListener("keydown", onKeydown);
    return () => {
      nav.removeEventListener("click", onClick);
      nav.removeEventListener("focusin", onFocusIn);
      nav.removeEventListener("keydown", onKeydown);
    };
  }, [ref, initial]);
}
