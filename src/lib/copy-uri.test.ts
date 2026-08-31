import assert from "node:assert/strict";
import test from "node:test";

import {
  COPY_URI_FAIL,
  COPY_URI_PLACEHOLDER_OK,
  COPY_URI_TESTNET_OK,
  COPY_URI_UNAVAILABLE,
  copyUri,
} from "./copy-uri.ts";

test("copyUri reports success only after writeText resolves", async () => {
  const written: string[] = [];
  const notice = await copyUri("zcash:{TEX_ADDRESS}?amount=1&label=Phlebas", {
    writeText: async (value) => {
      written.push(value);
    },
  }, "placeholder");
  assert.equal(notice, COPY_URI_PLACEHOLDER_OK);
  assert.doesNotMatch(notice, /payable address|receivable/i);
  assert.deepEqual(written, ["zcash:{TEX_ADDRESS}?amount=1&label=Phlebas"]);
});

test("copyUri names a testnet request only after a successful write", async () => {
  assert.equal(await copyUri("zcash:textest1example?amount=1&label=Phlebas", {
    writeText: async () => undefined,
  }, "testnet"), COPY_URI_TESTNET_OK);
});

test("copyUri stays honest when the clipboard is missing or rejects", async () => {
  assert.equal(await copyUri("zcash:x", null, "placeholder"), COPY_URI_UNAVAILABLE);
  assert.equal(await copyUri("zcash:x", undefined, "testnet"), COPY_URI_UNAVAILABLE);
  assert.equal(await copyUri("zcash:x", {
    writeText: async () => {
      throw new Error("denied");
    },
  }, "placeholder"), COPY_URI_FAIL);
  assert.match(COPY_URI_FAIL, /Nothing was sent/);
  assert.doesNotMatch(COPY_URI_FAIL, /^Copied/);
  assert.doesNotMatch(COPY_URI_UNAVAILABLE, /^Copied/);
});
