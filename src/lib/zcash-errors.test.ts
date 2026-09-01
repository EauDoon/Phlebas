import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  ZcashLengthError,
  ZcashScriptError,
  ZcashVersionError,
} from "./zcash-errors.ts";

test("ZcashLengthError names the field and the expected size", () => {
  const err = new ZcashLengthError("hash20", 20, 19);
  assert.ok(err.message.includes("hash20"));
  assert.ok(err.message.includes("20"));
  assert.ok(err.message.includes("19"));
  assert.ok(err instanceof RangeError);
});

test("ZcashVersionError names the version byte", () => {
  const err = new ZcashVersionError(0x25);
  assert.ok(err.message.includes("0x25"));
  assert.ok(err instanceof RangeError);
});

test("ZcashScriptError wraps a free-form reason", () => {
  const err = new ZcashScriptError("missing OP_ENDIF");
  assert.ok(err.message.includes("missing OP_ENDIF"));
  assert.ok(err instanceof RangeError);
});
