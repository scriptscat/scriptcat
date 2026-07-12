import * as net from "node:net";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as crypto from "node:crypto";

export interface IpcEndpoint {
  server: net.Server;
  /** Socket path (POSIX) or pipe name (Windows) — written into config.json for shim discovery. */
  endpointName: string;
  close(): Promise<void>;
}

function randomSuffix(bytes: number): string {
  return crypto.randomBytes(bytes).toString("hex");
}

/**
 * Creates the broker's listening endpoint: a random-named Unix domain socket under
 * `runtimeDir` on POSIX, or a random-named Windows named pipe. `runtimeDir` must already exist
 * with 0700 permissions — callers verify that via shared/config.ts before calling this (this
 * function doesn't create or chmod the directory itself, only the socket file).
 *
 * Peer-UID verification (SO_PEERCRED / LOCAL_PEERCRED — checking that the connecting process
 * runs as the same OS user) has no portable Node.js core API without a native addon, so it is
 * not implemented here — this is a documented residual limitation, not an oversight. The
 * enforced boundary instead is filesystem permissions: the containing directory is 0700 (only
 * the owning user can even locate the socket) and the socket file itself is chmod'd 0600 after
 * listen, which the OS enforces on `connect()` for AF_UNIX sockets exactly like a regular file.
 */
export async function createIpcEndpoint(runtimeDir: string): Promise<IpcEndpoint> {
  if (process.platform === "win32") {
    const pipeName = `\\\\.\\pipe\\scriptcat-mcp-${randomSuffix(8)}`;
    const server = net.createServer();
    await listen(server, pipeName);
    return {
      server,
      endpointName: pipeName,
      close: () => closeServer(server),
    };
  }

  const socketPath = path.join(runtimeDir, `scriptcat-mcp-${randomSuffix(4)}.sock`);
  const server = net.createServer();
  await listen(server, socketPath);
  await fs.chmod(socketPath, 0o600);

  return {
    server,
    endpointName: socketPath,
    close: async () => {
      await closeServer(server);
      await fs.unlink(socketPath).catch(() => {});
    },
  };
}

function listen(server: net.Server, target: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error) => reject(err);
    server.once("error", onError);
    server.listen(target, () => {
      server.removeListener("error", onError);
      resolve();
    });
  });
}

function closeServer(server: net.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}
