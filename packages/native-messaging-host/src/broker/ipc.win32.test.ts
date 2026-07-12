import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import type * as net from "node:net";

// The named-pipe branch of createIpcEndpoint (src/broker/ipc.ts) only actually runs on Windows.
// Colocating this with ipc.test.ts's real Unix-socket tests isn't possible — vi.mock("node:net")
// is file-scoped and would replace net.createServer for those real-socket tests too — so this
// branch is exercised here, in its own file, by mocking node:net and stubbing process.platform.
// That way the pipe-name construction and the "no POSIX-only chmod/unlink on this path" behavior
// are covered on every OS, not only in the Windows leg of the native-host CI matrix.
const fakeServer = Object.assign(new EventEmitter(), {
  listen: vi.fn((_target: string, cb: () => void) => {
    cb();
    return fakeServer;
  }),
  close: vi.fn((cb?: () => void) => {
    cb?.();
    return fakeServer;
  }),
});

vi.mock("node:net", async (importOriginal) => {
  const actual = await importOriginal<typeof net>();
  return { ...actual, createServer: vi.fn(() => fakeServer) };
});

describe("createIpcEndpoint - Windows named pipe 分支（doc 06 §3）", () => {
  it("构造 \\\\.\\pipe\\ 命名管道路径，且 close() 不涉及 fs.chmod/unlink（那些只适用于 POSIX 路径）", async () => {
    const platformSpy = vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    fakeServer.listen.mockClear();
    fakeServer.close.mockClear();

    try {
      const { createIpcEndpoint } = await import("./ipc");
      const endpoint = await createIpcEndpoint("C:\\unused-on-posix-mock");
      expect(endpoint.endpointName).toMatch(/^\\\\\.\\pipe\\scriptcat-mcp-[0-9a-f]{16}$/);
      expect(fakeServer.listen).toHaveBeenCalledWith(endpoint.endpointName, expect.any(Function));

      await endpoint.close();
      expect(fakeServer.close).toHaveBeenCalledTimes(1);
    } finally {
      platformSpy.mockRestore();
    }
  });
});
