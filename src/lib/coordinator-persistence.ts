// File-based coordinator persistence. The persistence layer writes
// the coordinator snapshot to a file on every transition and reads
// the snapshot back on startup. Writes are atomic: the layer writes
// to a temporary file and renames it on top of the target. The
// persistence layer never holds a key and never signs a transaction.

import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";

import type { CoordinatorState } from "./atomic-coordinator.ts";
import { snapshotFromJSON, snapshotToJSON, type Snapshot } from "./coordinator-snapshot.ts";

export type PersistenceConfig = Readonly<{
  path: string;
}>;

export type PersistenceError = Readonly<{ kind: "io"; path: string; cause: string }>;

export class CoordinatorPersistenceError extends Error {
  readonly kind: PersistenceError["kind"];
  readonly path: string;
  constructor(kind: PersistenceError["kind"], path: string, cause: string) {
    super(`Coordinator persistence error (${kind}) on ${path}: ${cause}`);
    this.kind = kind;
    this.path = path;
  }
}

async function ensureDir(path: string): Promise<void> {
  await fs.mkdir(path, { recursive: true });
}

export async function writeSnapshot(config: PersistenceConfig, state: CoordinatorState): Promise<void> {
  const target = config.path;
  const tmp = `${target}.tmp-${process.pid}-${Date.now().toString(36)}`;
  await ensureDir(dirname(target));
  const payload = JSON.stringify(snapshotToJSON(state), null, 2);
  try {
    await fs.writeFile(tmp, payload, { encoding: "utf8", flag: "wx" });
    await fs.rename(tmp, target);
  } catch (err) {
    throw new CoordinatorPersistenceError("io", target, err instanceof Error ? err.message : String(err));
  }
}

export async function readSnapshot(config: PersistenceConfig): Promise<CoordinatorState | null> {
  const target = config.path;
  let raw: string;
  try {
    raw = await fs.readFile(target, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw new CoordinatorPersistenceError("io", target, err instanceof Error ? err.message : String(err));
  }
  let parsed: Snapshot;
  try {
    parsed = JSON.parse(raw) as Snapshot;
  } catch (err) {
    throw new CoordinatorPersistenceError("io", target, err instanceof Error ? err.message : String(err));
  }
  return snapshotFromJSON(parsed);
}

export function tempPathFor(config: PersistenceConfig): string {
  return join(config.path + ".tmp");
}
