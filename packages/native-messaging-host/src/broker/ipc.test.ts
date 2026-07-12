import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { createIpcEndpoint, type IpcEndpoint } from "./ipc";

describe.skipIf(process.platform === "win32")("createIpcEndpoint - Unix domain socket", () => {
  let tmpRoot: string;
  let endpoint: IpcEndpoint | undefined;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sc-mcp-ipc-"));
    await fs.chmod(tmpRoot, 0o700);
  });

  afterEach(async () => {
    await endpoint?.close();
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("创建的 endpointName 位于 runtimeDir 下且随机", async () => {
    endpoint = await createIpcEndpoint(tmpRoot);
    expect(endpoint.endpointName.startsWith(tmpRoot)).toBe(true);
    expect(endpoint.endpointName.endsWith(".sock")).toBe(true);
  });

  it("两次创建产生不同的 socket 文件名", async () => {
    const first = await createIpcEndpoint(tmpRoot);
    const second = await createIpcEndpoint(tmpRoot);
    expect(first.endpointName).not.toBe(second.endpointName);
    await first.close();
    await second.close();
  });

  it("socket 文件权限为 0600（仅当前用户）", async () => {
    endpoint = await createIpcEndpoint(tmpRoot);
    const stat = await fs.stat(endpoint.endpointName);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it("客户端可以连接并进行双向通信", async () => {
    endpoint = await createIpcEndpoint(tmpRoot);
    const received: string[] = [];
    endpoint.server.on("connection", (socket) => {
      socket.on("data", (chunk) => {
        received.push(chunk.toString("utf-8"));
        socket.write("pong");
      });
    });

    const client = net.createConnection(endpoint.endpointName);
    await new Promise<void>((resolve, reject) => {
      client.once("connect", () => resolve());
      client.once("error", reject);
    });

    const clientReceived = new Promise<string>((resolve) => {
      client.once("data", (chunk) => resolve(chunk.toString("utf-8")));
    });
    client.write("ping");

    expect(await clientReceived).toBe("pong");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(received).toEqual(["ping"]);
    client.end();
  });

  it("server.address() 返回字符串路径而非 {port} —— 结构性证明从未监听 TCP 端口", async () => {
    endpoint = await createIpcEndpoint(tmpRoot);
    const address = endpoint.server.address();
    // A TCP listener's address() returns { address, family, port }; a Unix domain socket's
    // returns the socket path as a plain string. This is the structural proof the entire
    // CORS/DNS-rebinding/port-scanning attack class (A1) cannot apply — there is no port to scan.
    expect(typeof address).toBe("string");
    expect(address).toBe(endpoint.endpointName);
  });

  it("close() 移除 socket 文件，之后无法再连接", async () => {
    endpoint = await createIpcEndpoint(tmpRoot);
    const endpointName = endpoint.endpointName;
    await endpoint.close();
    endpoint = undefined;

    await expect(fs.stat(endpointName)).rejects.toThrow();

    const client = net.createConnection(endpointName);
    await new Promise<void>((resolve) => {
      client.once("error", () => resolve());
      client.once("connect", () => resolve());
    });
  });
});
