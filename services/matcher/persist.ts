import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { restoreOperator, snapshotOperator, type MatcherOperator, type OperatorSnapshot } from "../../src/lib/matcher-operator.ts";

export async function writeOperator(path: string, operator: MatcherOperator): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const snapshot = snapshotOperator(operator);
  await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`);
}

export async function readOperator(path: string): Promise<MatcherOperator | null> {
  try {
    const snapshot = JSON.parse(await readFile(path, "utf8")) as OperatorSnapshot;
    return restoreOperator(snapshot);
  } catch {
    return null;
  }
}
