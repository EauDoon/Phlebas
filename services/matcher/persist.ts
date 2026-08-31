import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

import { restoreOperator, snapshotOperator, type MatcherOperator, type OperatorSnapshot } from "../../src/lib/matcher-operator.ts";
import { atomicWriteFile } from "../durable-file.ts";

export async function writeOperator(path: string, operator: MatcherOperator): Promise<void> {
  const directoryPath = dirname(path);
  await mkdir(directoryPath, { recursive: true, mode: 0o700 });
  await atomicWriteFile(path, `${JSON.stringify(snapshotOperator(operator), null, 2)}\n`);
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
