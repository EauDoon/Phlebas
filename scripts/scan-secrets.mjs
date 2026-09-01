import { execFile as execFileCallback } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const root = process.cwd();
const execFile = promisify(execFileCallback);
const skippedDirectories = new Set([
  ".git",
  ".next",
  "broadcast",
  "cache",
  "coverage",
  "node_modules",
  "out",
  "test-results",
]);

const patterns = [
  { name: "pem-private-key", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "github-token", regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/ },
  { name: "github-pat", regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { name: "aws-access-key", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "stripe-live-key", regex: /\bsk_live_[A-Za-z0-9]{16,}\b/ },
  { name: "tex-address", regex: /\btex1[0-9a-z]{20,}\b/ },
  { name: "vercel-operator-gateway", regex: /PHLEBAS_GATEWAY_URL\s*[:=]/ },
  { name: "vercel-operator-matcher", regex: /PHLEBAS_MATCHER_URL\s*[:=]/ },
];

const { stdout } = await execFile("git", ["ls-files", "-z"], { cwd: root, maxBuffer: 4 * 1024 * 1024 });
const files = stdout
  .split("\0")
  .filter(Boolean)
  .filter((relativePath) => !relativePath.split("/").some((part) => skippedDirectories.has(part)));
const hits = [];

for (const relativePath of files) {
  if (relativePath === "scripts/scan-secrets.mjs") {
    continue;
  }
  const file = join(root, relativePath);
  let fileStat;
  try {
    fileStat = await stat(file);
  } catch {
    // `git ls-files` includes an unstaged deletion. Skip it without widening
    // the scan beyond tracked repository paths.
    continue;
  }
  if (fileStat.size > 1_000_000) {
    continue;
  }
  let content;
  try {
    content = await readFile(file, "utf8");
  } catch {
    continue;
  }
  if (content.includes("\u0000")) {
    continue;
  }
  for (const pattern of patterns) {
    if (
      pattern.name.startsWith("vercel-operator")
      && !/(^|\/)(\.env|vercel\.json|\.vercel\/)/.test(relativePath)
    ) {
      continue;
    }
    if (pattern.regex.test(content)) {
      hits.push(`${relativePath}: ${pattern.name}`);
    }
  }
}

if (hits.length > 0) {
  console.error("Secret-pattern scan failed:");
  for (const hit of hits) {
    console.error(`  ${hit}`);
  }
  process.exit(1);
}

console.log(`Secret-pattern scan passed (${files.length} tracked files).`);
