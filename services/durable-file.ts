import { open, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

const WINDOWS_DIRECTORY_SYNC_ERRORS = new Set(["EPERM", "EINVAL", "ENOSYS"]);

// Windows refuses to rename a file over a destination that some other handle has
// open without FILE_SHARE_DELETE. Node's own readFile does not request that share
// mode, so a concurrent reader of the very file we are about to replace -- a health
// check, a backup tool, an antivirus scan, an operator running `type` on it -- can
// make an otherwise-correct rename fail with EPERM/EBUSY/EACCES even though nothing
// is corrupt: the fully written, fsynced temp file is sitting right there intact.
// Retrying is safe because rename is all-or-nothing at the OS level, never partial;
// without this, one transient reader latches the whole store into a persistence
// fault (see PersistentMatcherStore#markFault) over a lock that would have cleared
// on its own a few milliseconds later.
const WINDOWS_TRANSIENT_RENAME_ERRORS = new Set(["EPERM", "EBUSY", "EACCES"]);
const RENAME_RETRY_ATTEMPTS = 40;
const RENAME_RETRY_BASE_DELAY_MS = 5;
const RENAME_RETRY_MAX_DELAY_MS = 250;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, milliseconds); });
}

async function renameIntoPlace(temporaryPath: string, path: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(temporaryPath, path);
      return;
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException).code;
      const retryable = process.platform === "win32" && !!code && WINDOWS_TRANSIENT_RENAME_ERRORS.has(code);
      if (!retryable || attempt >= RENAME_RETRY_ATTEMPTS - 1) throw error;
      await sleep(Math.min(RENAME_RETRY_MAX_DELAY_MS, RENAME_RETRY_BASE_DELAY_MS * 2 ** attempt));
    }
  }
}

export async function syncDirectory(path: string): Promise<void> {
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
    await renameIntoPlace(temporaryPath, path);
    renamed = true;
    await syncDirectory(directoryPath);
  } finally {
    if (!renamed) {
      await handle.close().catch(() => undefined);
      await unlink(temporaryPath).catch(() => undefined);
    }
  }
}
