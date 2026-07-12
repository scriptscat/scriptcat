import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";

// Per-platform base config/data directory for the native host's own state (host config,
// paired-client token store, runtime IPC socket/pipe directory).
export function resolveConfigDir(platform: NodeJS.Platform = process.platform): string {
  if (platform === "win32") {
    return path.join(process.env.LOCALAPPDATA || os.homedir(), "ScriptCat", "NativeHost");
  }
  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "ScriptCat", "NativeHost");
  }
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "scriptcat", "native-host");
}

export type PermissionCheckResult = { ok: true } | { ok: false; reason: string };

/**
 * Refuses a group/world-writable directory, after resolving symlinks first: a symlink swap
 * could otherwise point a "verified" path at an attacker-writable location between the check and
 * use. POSIX mode bits are meaningless on Windows — ACL correctness there is the installer's job
 * (`icacls`, run at install time), so this check is a no-op success on win32.
 */
export async function verifyDirPermissions(dirPath: string): Promise<PermissionCheckResult> {
  let real: string;
  try {
    real = await fs.realpath(dirPath);
  } catch {
    return { ok: false, reason: "PATH_NOT_FOUND" };
  }
  if (process.platform === "win32") {
    return { ok: true };
  }
  const stat = await fs.stat(real);
  const groupOrWorldWritable = (stat.mode & 0o022) !== 0;
  if (groupOrWorldWritable) {
    return { ok: false, reason: "WORLD_OR_GROUP_WRITABLE" };
  }
  return { ok: true };
}

/**
 * Writes atomically: a temp file in the same directory (so the rename is same-filesystem and
 * therefore atomic), `wx` flag so a concurrent writer can't race us into an interleaved partial
 * file, then rename over the destination. A crash between write and rename leaves the original
 * file (or nothing, on first write) untouched — never a half-written destination.
 */
export async function atomicWriteFile(filePath: string, content: string, mode = 0o600): Promise<void> {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
  );
  await fs.writeFile(tmpPath, content, { mode, flag: "wx" });
  try {
    await fs.rename(tmpPath, filePath);
  } catch (e) {
    await fs.unlink(tmpPath).catch(() => {});
    throw e;
  }
  if (process.platform !== "win32") {
    await fs.chmod(filePath, mode);
  }
}
