import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";

import { restoreOperator, snapshotOperator, type MatcherOperator, type OperatorSnapshot } from "../../src/lib/matcher-operator.ts";

export async function writeOperator(path: string, operator: MatcherOperator): Promise<void> {
  const directoryPath = dirname(path);
  await mkdir(directoryPath, { recursive: true, mode: 0o700 });
  const snapshot = snapshotOperator(operator);
  const temporaryPath = join(directoryPath, `state-${process.pid}-${randomUUID()}.tmp`);
  const handle = await open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporaryPath, path);
  const directory = await open(directoryPath, "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

export async function readOperator(path: string): Promise<MatcherOperator | null> {
  try {
    const snapshot = JSON.parse(await readFile(path, "utf8")) as OperatorSnapshot;
    return restoreOperator(snapshot);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
