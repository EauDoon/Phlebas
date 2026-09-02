import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const cssFiles = [
  "src/app/globals.css",
  "src/components/landing.module.css",
  "src/components/terminal.module.css",
] as const;

test("shipped accent is prismatic cyan with accessible semantic colors", async () => {
  const globals = await readFile(join(root, "src/app/globals.css"), "utf8");
  const accent = globals.match(/--accent:\s*(#[0-9a-fA-F]{3,8})\s*;/);
  assert.equal(accent?.[1].toLowerCase(), "#4ddcff");
  assert.notEqual(accent?.[1].toLowerCase(), "#f4c95d");
  assert.doesNotMatch(globals, /--accent:\s*#2dd4bf/i);
  assert.doesNotMatch(globals, /--accent:\s*#f4c95d/i);
  assert.match(globals, /--accent-dim:\s*#6b8cff;/i);
  assert.match(globals, /--accent-fg:\s*#03121b;/i);
  assert.match(globals, /--accent-soft:\s*rgba\(77,\s*220,\s*255,\s*0\.14\)/i);
  assert.match(globals, /--background:\s*#050816;/);
  assert.match(globals, /--surface:\s*#081121;/);
  assert.match(globals, /--info:\s*#78a9ff;/);
  assert.match(globals, /--buy:\s*#42e6ae;/);
  assert.match(globals, /--sell:\s*#ff6b8a;/);
  assert.match(globals, /--warning:\s*#ffd166;/);
  assert.match(globals, /--prism-gradient:\s*linear-gradient\(115deg,/);
});

test("owned UI CSS does not ship leftover teal or retired warm gold", async () => {
  const joined = (
    await Promise.all(cssFiles.map((file) => readFile(join(root, file), "utf8")))
  ).join("\n");
  assert.doesNotMatch(joined, /#f4c95d/i);
  assert.doesNotMatch(joined, /244\s*,\s*201\s*,\s*93/);
  assert.doesNotMatch(joined, /#2dd4bf/i);
  assert.doesNotMatch(joined, /45\s*,\s*212\s*,\s*191/);
  assert.doesNotMatch(joined, /#f0c14b/i);
  assert.doesNotMatch(joined, /240\s*,\s*193\s*,\s*75/);
  assert.doesNotMatch(joined, /22\s*,\s*18\s*,\s*4/);
  assert.match(joined, /\.primaryAction:not\(\.sellAction\):not\(:disabled\)/);
  assert.doesNotMatch(joined, /border-radius:\s*999px/);
});
