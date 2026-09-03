#!/usr/bin/env node
// Runs every key-independent release gate and fails closed on an
// incomplete or malformed required audit checklist.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateAuditChecklistRows, parseAuditChecklistRows } from "../src/lib/audit-checklist.ts";
import { evaluateReadiness } from "../src/lib/release-readiness.ts";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const bundledNpmCli = resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
const npmCli = process.env.npm_execpath || (existsSync(bundledNpmCli) ? bundledNpmCli : null);
const npmCommand = npmCli ? process.execPath : "npm";
const npmPrefix = npmCli ? [npmCli] : [];

function runGate(name, args) {
  const result = spawnSync(npmCommand, [...npmPrefix, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  if (result.status === 0) {
    return { name, status: "pass", detail: "ok" };
  }
  const detail = result.error?.message || result.stderr || result.stdout || `process exited with status ${result.status}`;
  return { name, status: "fail", detail: detail.slice(0, 500) };
}

function readAuditChecklistGate() {
  const path = resolve(projectRoot, "docs/audit/audit-checklist.md");
  if (!existsSync(path)) {
    return { name: "audit-checklist", status: "fail", detail: "audit checklist not found" };
  }
  try {
    return { name: "audit-checklist", ...evaluateAuditChecklistRows(parseAuditChecklistRows(readFileSync(path, "utf8"))) };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { name: "audit-checklist", status: "fail", detail: detail.slice(0, 500) };
  }
}

const gates = [
  runGate("lint", ["run", "lint"]),
  runGate("contract-format", ["run", "lint:contracts"]),
  runGate("typecheck", ["run", "typecheck"]),
  runGate("tests", ["test"]),
  runGate("manifests", ["run", "test:manifests"]),
  runGate("contract-build", ["run", "build:contracts"]),
  runGate("contracts", ["run", "test:contracts"]),
  runGate("secret-scan", ["run", "scan:secrets"]),
  runGate("build", ["run", "build"]),
  runGate("browser", ["run", "test:browser"]),
  readAuditChecklistGate(),
];

const evaluated = evaluateReadiness(gates, BigInt(Math.floor(Date.now() / 1000)));
const verdict = {
  ...evaluated,
  gates,
  generatedAt: evaluated.generatedAt.toString(),
};

process.stdout.write(`${JSON.stringify(verdict, null, 2)}\n`);
if (!verdict.ready) process.exit(1);
