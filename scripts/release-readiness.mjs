#!/usr/bin/env node
// Release readiness script. The script runs the automated gates
// and prints the release verdict. The script is the entry point
// for the on-call engineer's sign-off.

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const bundledNpmCli = resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
const npmCli = process.env.npm_execpath || (existsSync(bundledNpmCli) ? bundledNpmCli : null);
const npmCommand = npmCli ? process.execPath : "npm";
const npmPrefix = npmCli ? [npmCli] : [];

function runGate(name, command, args) {
  const result = spawnSync(command, args, {
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

const gates = [];
gates.push(runGate("lint", npmCommand, [...npmPrefix, "run", "lint"]));
gates.push(runGate("contract-format", npmCommand, [...npmPrefix, "run", "lint:contracts"]));
gates.push(runGate("typecheck", npmCommand, [...npmPrefix, "run", "typecheck"]));
gates.push(runGate("tests", npmCommand, [...npmPrefix, "test"]));
gates.push(runGate("manifests", npmCommand, [...npmPrefix, "run", "test:manifests"]));
gates.push(runGate("contract-build", npmCommand, [...npmPrefix, "run", "build:contracts"]));
gates.push(runGate("contracts", npmCommand, [...npmPrefix, "run", "test:contracts"]));
gates.push(runGate("secret-scan", npmCommand, [...npmPrefix, "run", "scan:secrets"]));
gates.push(runGate("build", npmCommand, [...npmPrefix, "run", "build"]));
gates.push(readAuditChecklistGate());

function readAuditChecklistGate() {
  const path = resolve(projectRoot, "docs/audit/audit-checklist.md");
  if (!existsSync(path)) {
    return { name: "audit-checklist", status: "fail", detail: "audit checklist not found" };
  }
  const text = readFileSync(path, "utf8");
  const requiredNotDone = (text.match(/\| yes \|/g) ?? []).length - (text.match(/\| done \|/g) ?? []).length;
  if (requiredNotDone > 0) {
    return { name: "audit-checklist", status: "fail", detail: `${requiredNotDone} required items not done` };
  }
  return { name: "audit-checklist", status: "pass", detail: "all required items done" };
}

const verdict = {
  ready: gates.every((g) => g.status !== "fail"),
  gates,
  generatedAt: BigInt(Math.floor(Date.now() / 1000)).toString(),
};

process.stdout.write(JSON.stringify(verdict, null, 2) + "\n");

if (!verdict.ready) {
  process.exit(1);
}
