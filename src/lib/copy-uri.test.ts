import assert from "node:assert/strict";
import test from "node:test";

import { COPY_URI_FAIL, COPY_URI_OK, copyUri } from "./copy-uri.ts";

test("copyUri reports success only after writeText resolves", async () => {
  const written: string[] = [];
  const notice = await copyUri("zcash:{TEX_ADDRESS}?amount=1&label=Phlebas", {
    writeText: async (value) => {
      written.push(value);
    },
  });
  assert.equal(notice, COPY_URI_OK);
  assert.deepEqual(written, ["zcash:{TEX_ADDRESS}?amount=1&label=Phlebas"]);
});

test("copyUri stays honest when the clipboard is missing or rejects", async () => {
  assert.equal(await copyUri("zcash:x", null), COPY_URI_FAIL);
  assert.equal(await copyUri("zcash:x", undefined), COPY_URI_FAIL);
  assert.equal(await copyUri("zcash:x", {
    writeText: async () => {
      throw new Error("denied");
    },
  }), COPY_URI_FAIL);
  assert.match(COPY_URI_FAIL, /Nothing was sent/);
  assert.doesNotMatch(COPY_URI_FAIL, /^Copied/);
});
