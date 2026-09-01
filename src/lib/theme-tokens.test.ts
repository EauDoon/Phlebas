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

test("shipped accent is warm yellow and not retired gold", async () => {
  const globals = await readFile(join(root, "src/app/globals.css"), "utf8");
  const accent = globals.match(/--accent:\s*(#[0-9a-fA-F]{3,8})\s*;/);
  assert.equal(accent?.[1].toLowerCase(), "#f0c14b");
  assert.notEqual(accent?.[1].toLowerCase(), "#f4c95d");
  assert.doesNotMatch(globals, /--accent:\s*#2dd4bf/i);
  assert.doesNotMatch(globals, /--accent:\s*#f4c95d/i);
  assert.match(globals, /--accent-dim:\s*#a67c1a;/i);
  assert.match(globals, /--accent-fg:\s*#161204;/i);
  assert.match(globals, /--accent-soft:\s*rgba\(240,\s*193,\s*75,\s*0\.14\)/i);
  assert.match(globals, /--background:\s*#0a0908;/);
  assert.match(globals, /--surface:\s*#16130f;/);
  assert.match(globals, /--surface-raised:\s*#1e1a14;/);
  assert.match(globals, /--surface-soft:\s*#1e1a14;/);
  assert.match(globals, /--elevated:\s*#1e1a14;/);
  assert.match(globals, /--border:\s*#3a3428;/);
  assert.match(globals, /--border-strong:\s*#3a3428;/);
  assert.match(globals, /--line:\s*#3a3428;/);
  assert.match(globals, /--text:\s*#f7f1e6;/);
  assert.match(globals, /--text-secondary:\s*#a39888;/);
  assert.match(globals, /--text-muted:\s*#a39888;/);
  assert.match(globals, /--muted:\s*#a39888;/);
  assert.match(globals, /--info:\s*#7eb6ff;/);
  assert.match(globals, /--buy:\s*#3dcc8a;/);
  assert.match(globals, /--bid:\s*#3dcc8a;/);
  assert.match(globals, /--sell:\s*#f07178;/);
  assert.match(globals, /--ask:\s*#f07178;/);
});

test("owned UI CSS does not ship leftover teal or retired gold", async () => {
  const joined = (
    await Promise.all(cssFiles.map((file) => readFile(join(root, file), "utf8")))
  ).join("\n");
  assert.doesNotMatch(joined, /#f4c95d/i);
  assert.doesNotMatch(joined, /244\s*,\s*201\s*,\s*93/);
  assert.doesNotMatch(joined, /#2dd4bf/i);
  assert.doesNotMatch(joined, /45\s*,\s*212\s*,\s*191/);
  assert.doesNotMatch(joined, /radial-gradient/i);
  assert.doesNotMatch(joined, /linear-gradient/i);
  assert.doesNotMatch(joined, /border-radius:\s*999px/);
});

test("P mark is warm yellow on warm near-black", async () => {
  const icon = await readFile(join(root, "src/app/icon.svg"), "utf8");
  assert.match(icon, /fill="#0a0908"/);
  assert.match(icon, /fill="#f0c14b"/);
  assert.doesNotMatch(icon, /#f4c95d/i);
  assert.doesNotMatch(icon, /#2dd4bf/i);
});
