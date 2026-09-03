import { open, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

const WINDOWS_DIRECTORY_SYNC_ERRORS = new Set(["EPERM", "EINVAL", "ENOSYS"]);

async function syncDirectory(path: string): Promise<void> {
  const directory = await open(path, "r");
  try {
    await directory.sync();
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    if (process.platform !== "win32" || !code || !WINDOWS_DIRECTORY_SYNC_ERRORS.has(code)) throw error;
    // Windows does not expose a portable directory fsync. File fsync and atomic
    // rename remain mandatory; only this unsupported final durability barrier is skipped.
  } finally {
    await directory.close();
  }
}

export async function atomicWriteFile(path: string, contents: string): Promise<void> {
  const directoryPath = dirname(path);
  const temporaryPath = join(directoryPath, `.phlebas-${process.pid}-${randomUUID()}.tmp`);
  const handle = await open(temporaryPath, "wx", 0o600);
  let renamed = false;
  try {
    await handle.writeFile(contents, "utf8");
    await handle.sync();
    await handle.close();
    await rename(temporaryPath, path);
    renamed = true;
    await syncDirectory(directoryPath);
  } finally {
    if (!renamed) {
      await handle.close().catch((err) => {
        console.warn("durable-file: temp handle close failed during cleanup", err);
      });
      await unlink(temporaryPath).catch((err) => {
        console.warn("durable-file: temp file unlink failed during cleanup", err);
      });
    }
  }
}
