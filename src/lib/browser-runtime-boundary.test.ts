import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

// docs/DELIVERY_PLAN.md, "Repository topology": "The public application
// imports only browser-safe packages. It cannot import node credentials,
// service journals, signer code, or deployment secrets."
//
// That held when this test was written, and nothing was enforcing it.
// Several modules in src/lib do reach for node builtins, deliberately:
// ripemd160.ts and sha256d.ts wrap node:crypto because Web Crypto has no
// ripemd160, and zcash-address.ts carries a separate pure-JS pair for the
// browser path. Which of the two a module picks up is decided by an
// import line, so the boundary between them is one edit wide, and a
// crossing shows up as a runtime failure in a wallet flow rather than as
// a failing build.

const SOURCE_DIRECTORIES = ["src/app", "src/components"] as const;
const IMPORT_PATTERN = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+["']([^"']+)["']/g;
const CLIENT_DIRECTIVE = /^\s*["']use client["']/m;

async function sourceFilesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relativePath = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await sourceFilesUnder(relativePath));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) files.push(relativePath);
  }
  return files;
}

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(IMPORT_PATTERN)].map((match) => match[1]!);
}

/** Resolve a relative or `@/` specifier to a repository path, or null. */
async function resolveSpecifier(fromPath: string, specifier: string): Promise<string | null> {
  let target: string;
  if (specifier.startsWith(".")) target = resolve(dirname(join(root, fromPath)), specifier);
  else if (specifier.startsWith("@/")) target = join(root, "src", specifier.slice(2));
  else return null;
  for (const candidate of [target, `${target}.ts`, `${target}.tsx`, join(target, "index.ts")]) {
    try {
      await readFile(candidate, "utf8");
      return relative(root, candidate).replaceAll("\\", "/");
    } catch {
      // Not this extension; try the next candidate.
    }
  }
  return null;
}

type Reachable = Readonly<{
  entries: ReadonlyArray<string>;
  modules: ReadonlyArray<string>;
  nodeImports: ReadonlyArray<readonly [string, string]>;
  serviceImports: ReadonlyArray<readonly [string, string]>;
}>;

async function reachableFromClientComponents(): Promise<Reachable> {
  const candidates: string[] = [];
  for (const directory of SOURCE_DIRECTORIES) candidates.push(...await sourceFilesUnder(directory));

  const entries: string[] = [];
  for (const path of candidates) {
    if (CLIENT_DIRECTIVE.test(await readFile(join(root, path), "utf8"))) entries.push(path);
  }

  const seen = new Set<string>();
  const nodeImports: Array<readonly [string, string]> = [];
  const serviceImports: Array<readonly [string, string]> = [];
  const queue = [...entries];
  while (queue.length > 0) {
    const path = queue.pop()!;
    if (seen.has(path)) continue;
    seen.add(path);
    for (const specifier of importSpecifiers(await readFile(join(root, path), "utf8"))) {
      if (specifier.startsWith("node:")) {
        nodeImports.push([path, specifier]);
        continue;
      }
      const resolved = await resolveSpecifier(path, specifier);
      if (resolved === null) continue;
      if (resolved.startsWith("services/")) serviceImports.push([path, resolved]);
      queue.push(resolved);
    }
  }
  return { entries, modules: [...seen].sort(), nodeImports, serviceImports };
}

const reachable = await reachableFromClientComponents();

test("the client import graph is large enough for this test to mean something", () => {
  // A resolver that silently stopped resolving would make every assertion
  // below pass trivially. These floors are well under the real numbers and
  // exist only to catch that.
  assert.ok(reachable.entries.length >= 10, `only ${reachable.entries.length} client entry points found`);
  assert.ok(reachable.modules.length >= 50, `only ${reachable.modules.length} modules reachable`);
});

test("no module reachable from a client component imports a node builtin", () => {
  const offenders = reachable.nodeImports.map(([path, specifier]) => `${path} imports ${specifier}`);
  assert.deepEqual(offenders, [], `browser bundle would pull in a node builtin:\n${offenders.join("\n")}`);
});

test("no module reachable from a client component imports a service", () => {
  // services/ holds the matcher journal, the durable file writer, and the
  // observer. None of it belongs in a bundle served to a browser.
  const offenders = reachable.serviceImports.map(([path, target]) => `${path} imports ${target}`);
  assert.deepEqual(offenders, [], `browser bundle would pull in service code:\n${offenders.join("\n")}`);
});

test("the node-only crypto wrappers stay out of the client graph", () => {
  // ripemd160.ts and sha256d.ts wrap node:crypto. zcash-address.ts carries
  // the pure-JS equivalents that the browser path has to use instead.
  // Naming them here means a future import of the wrong one fails with
  // this message rather than at runtime inside a wallet flow.
  for (const nodeOnly of ["src/lib/ripemd160.ts", "src/lib/sha256d.ts", "src/lib/coordinator-persistence.ts"]) {
    assert.equal(
      reachable.modules.includes(nodeOnly),
      false,
      `${nodeOnly} is node-only and is reachable from a client component`,
    );
  }
});
