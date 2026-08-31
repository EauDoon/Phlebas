import assert from "node:assert/strict";
import test from "node:test";

import { parseStrictJson } from "./strict-json.ts";

test("parses bounded JSON while retaining an inert object prototype", () => {
  const parsed = parseStrictJson('{"a":[1,true,null,"x\\u0020y"],"b":{"c":-2}}') as Record<string, unknown>;
  assert.deepEqual(parsed.a, [1, true, null, "x y"]);
  assert.equal(Object.getPrototypeOf(parsed), null);
});

test("rejects duplicate, forbidden, unsafe, deep, and trailing JSON", () => {
  assert.throws(() => parseStrictJson('{"a":1,"a":2}'), /Duplicate/);
  assert.throws(() => parseStrictJson('{"__proto__":1}'), /Forbidden/);
  assert.throws(() => parseStrictJson("9007199254740992"), /safe integers/);
  assert.throws(() => parseStrictJson("[[[0]]]", { maximumDepth: 2 }), /depth limit/);
  assert.throws(() => parseStrictJson("{}{}"), /trailing/);
});
