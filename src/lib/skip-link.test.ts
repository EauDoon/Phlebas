import assert from "node:assert/strict";
import test from "node:test";

import { activateSkipLink } from "./skip-link.ts";

test("activateSkipLink ignores a non-hash href without touching focus", () => {
  let prevented = false;
  let blurred = 0;
  activateSkipLink({
    currentTarget: {
      getAttribute: () => "/trade",
      blur: () => {
        blurred += 1;
      },
    },
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.equal(prevented, false);
  assert.equal(blurred, 0);
});

test("activateSkipLink ignores a missing hash target without preventing default", () => {
  let prevented = false;
  activateSkipLink({
    currentTarget: {
      getAttribute: () => "#missing-skip-target",
      blur: () => {
        throw new Error("blur should not run");
      },
    },
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.equal(prevented, false);
});

test("activateSkipLink blurs the skip link and focuses the hash target", () => {
  const target = {
    focused: 0,
    focus() {
      this.focused += 1;
    },
  };
  const previousDocument = globalThis.document;
  const previousHistory = globalThis.history;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    writable: true,
    value: {
      getElementById(id: string) {
        return id === "main-content" ? target : null;
      },
    },
  });
  let replaced = "";
  Object.defineProperty(globalThis, "history", {
    configurable: true,
    writable: true,
    value: {
      replaceState(_state: unknown, _title: string, url: string) {
        replaced = url;
      },
    },
  });

  try {
    let prevented = false;
    let blurred = 0;
    activateSkipLink({
      currentTarget: {
        getAttribute: () => "#main-content",
        blur: () => {
          blurred += 1;
        },
      },
      preventDefault: () => {
        prevented = true;
      },
    });
    assert.equal(prevented, true);
    assert.equal(blurred, 1);
    assert.equal(target.focused, 1);
    assert.equal(replaced, "#main-content");
  } finally {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: previousDocument,
    });
    Object.defineProperty(globalThis, "history", {
      configurable: true,
      writable: true,
      value: previousHistory,
    });
  }
});
