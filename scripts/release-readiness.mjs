#!/usr/bin/env node
// Release readiness script. The script runs the automated gates
// and prints the release verdict. The script is the entry point
// for the on-call engineer's sign-off.

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { parseAuditChecklistRows } from "../src/lib/audit-checklist.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function runGate(name, command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });
  if (result.status === 0) {
    return { name, status: "pass", detail: "ok" };
  }
  return { name, status: "fail", detail: (result.stderr || result.stdout || "").slice(0, 500) };
}

const gates = [];
gates.push(runGate("lint", npmCommand, ["run", "lint"]));
gates.push(runGate("typecheck", npmCommand, ["run", "typecheck"]));
gates.push(runGate("tests", npmCommand, ["test"]));
gates.push(runGate("secret-scan", npmCommand, ["run", "scan:secrets"]));
gates.push(runGate("build", npmCommand, ["run", "build"]));
gates.push(runGate("contracts", npmCommand, ["run", "test:contracts"]));
gates.push(readAuditChecklistGate());

function readAuditChecklistGate() {
  const path = resolve(projectRoot, "docs/audit/audit-checklist.md");
  if (!existsSync(path)) {
    return { name: "audit-checklist", status: "fail", detail: "audit checklist not found" };
  }
  const text = readFileSync(path, "utf8");
  const requiredRows = parseAuditChecklistRows(text).filter((row) => row.required);
  if (requiredRows.length === 0) {
    return { name: "audit-checklist", status: "fail", detail: "audit checklist has no required rows" };
  }
  const incomplete = requiredRows.filter((row) => row.status !== "done");
  if (incomplete.length > 0) {
    return {
      name: "audit-checklist",
      status: "fail",
      detail: `${incomplete.length} required items not done: ${incomplete.map((row) => row.id).join(", ")}`,
    };
  }
  return { name: "audit-checklist", status: "pass", detail: "all required items done" };
}

const verdict = {
  ready: gates.length > 0 && gates.every((g) => g.status === "pass"),
  gates,
  generatedAt: BigInt(Math.floor(Date.now() / 1000)).toString(),
};

process.stdout.write(JSON.stringify(verdict, null, 2) + "\n");

if (!verdict.ready) {
  process.exit(1);
}
