import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = join(dirname(fileURLToPath(import.meta.url)), "scan-secrets.mjs");
// Assembled at run time so this file does not itself contain the literal
// the scanner looks for. The scanner skips exactly one path, its own, and
// widening that exclusion to cover a test fixture would be a hole.
const BEGIN = ["-----BEGIN", "RSA", "PRIVATE", "KEY-----"].join(" ");
const END = ["-----END", "RSA", "PRIVATE", "KEY-----"].join(" ");
const PEM = `${BEGIN}\nMIIEow==\n${END}\n`;

/**
 * The scanner reads `git ls-files`, so a fixture needs a real repository.
 * Each case tracks the scanner itself plus one file, and the scanner skips
 * its own path so its pattern table is never the thing that matches.
 */
function scanRepositoryContaining(files) {
  const directory = mkdtempSync(join(tmpdir(), "phlebas-scan-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: directory });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: directory });
    execFileSync("git", ["config", "user.name", "test"], { cwd: directory });
    mkdirSync(join(directory, "scripts"), { recursive: true });
    cpSync(scriptPath, join(directory, "scripts", "scan-secrets.mjs"));
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(directory, name), content);
    }
    execFileSync("git", ["add", "-A"], { cwd: directory });
    try {
      execFileSync("node", ["scripts/scan-secrets.mjs"], { cwd: directory, encoding: "utf8" });
      return { status: 0, output: "" };
    } catch (error) {
      return { status: error.status, output: String(error.stderr) };
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("catches a private key in a small file", () => {
  const result = scanRepositoryContaining({ "small.pem": PEM });
  assert.equal(result.status, 1);
  assert.match(result.output, /small\.pem: pem-private-key/);
});

test("catches a private key past the size at which the scan used to give up", () => {
  // A 1 MB ceiling used to skip the file before it was read at all, so a
  // key padded past the limit, or committed inside any large bundled
  // asset, produced a clean pass on the release gate.
  const result = scanRepositoryContaining({ "big.pem": `${"padding\n".repeat(220_000)}${PEM}` });
  assert.equal(result.status, 1);
  assert.match(result.output, /big\.pem: pem-private-key/);
});

test("catches a private key lying across a chunk boundary", () => {
  // The chunked reader is only correct because each chunk carries the tail
  // of the one before it. Without that overlap this key would fall in the
  // gap between two reads and match neither.
  const result = scanRepositoryContaining({
    "boundary.pem": `${"x".repeat(1_000_000 - 15)}${PEM}${"y".repeat(200_000)}`,
  });
  assert.equal(result.status, 1);
  assert.match(result.output, /boundary\.pem: pem-private-key/);
});

test("passes a large file that holds no secret", () => {
  const result = scanRepositoryContaining({ "big.txt": "padding\n".repeat(400_000) });
  assert.equal(result.status, 0);
});

test("reports a pattern once per file rather than once per chunk", () => {
  const result = scanRepositoryContaining({
    "repeated.pem": `${PEM}${"z".repeat(1_200_000)}${PEM}`,
  });
  assert.equal(result.status, 1);
  assert.equal(result.output.match(/repeated\.pem: pem-private-key/g)?.length, 1);
});
