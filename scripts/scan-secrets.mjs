import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd();
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

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (skippedDirectories.has(entry.name)) {
        continue;
      }
      files.push(...await walk(join(directory, entry.name)));
      continue;
    }
    if (entry.isFile()) {
      files.push(join(directory, entry.name));
    }
  }
  return files;
}

const files = await walk(root);
const hits = [];

for (const file of files) {
  const fileStat = await stat(file);
  if (fileStat.size > 1_000_000) {
    continue;
  }
  const relativePath = relative(root, file).replaceAll("\\", "/");
  if (relativePath === "scripts/scan-secrets.mjs") {
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

console.log(`Secret-pattern scan passed (${files.length} files).`);
