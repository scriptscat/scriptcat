import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { createIpcEndpoint, type IpcEndpoint } from "./ipc";
import { BrokerServer } from "./server";
import type { SessionDeps, BridgeCallOutcome } from "./session";
import { PairingManager } from "../auth/pairing";
import { AuthFailureLockout, ConcurrencyLimiter, WindowedRateLimiter } from "./rate-limit";
import { computeMac } from "../auth/challenge";
import type { StoredClient } from "../auth/token-store";

const TOKEN_HASH = "a".repeat(64);
const STORED_CLIENT: StoredClient = {
  clientId: "client-1",
  displayName: "Test Client",
  tokenHash: TOKEN_HASH,
  scopes: ["scripts:list"],
  createdAt: Date.now(),
  lastUsedAt: Date.now(),
  revoked: false,
};

/** Reads newline-delimited JSON messages off a socket as they arrive. */
function createLineCollector(socket: net.Socket) {
  const messages: unknown[] = [];
  let buffer = "";
  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf-8");
    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.length > 0) messages.push(JSON.parse(line));
    }
  });
  return messages;
}

function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("timeout waiting for condition"));
      setTimeout(check, 5);
    };
    check();
  });
}

describe.skipIf(process.platform === "win32")(
  "BrokerServer - 端到端握手/call over 真实 Unix socket（doc 03 §4）",
  () => {
    let tmpRoot: string;
    let ipcEndpoint: IpcEndpoint;
    let server: BrokerServer;
    let dispatchBridgeCall: (clientId: string, action: string, input: unknown) => Promise<BridgeCallOutcome>;
    let lastConnectionId: string | undefined;

    beforeEach(async () => {
      tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sc-mcp-server-"));
      await fs.chmod(tmpRoot, 0o700);
      ipcEndpoint = await createIpcEndpoint(tmpRoot);

      dispatchBridgeCall = async () => ({ ok: true, result: { scripts: [] } });
      lastConnectionId = undefined;

      server = new BrokerServer(ipcEndpoint, (connectionId, send) => {
        lastConnectionId = connectionId;
        const deps: SessionDeps = {
          connectionId,
          endpointName: ipcEndpoint.endpointName,
          serverInfo: { name: "scriptcat-native-host", version: "0.1.0" },
          tokenStore: {
            get: (id) => (id === STORED_CLIENT.clientId ? STORED_CLIENT : undefined),
            touchLastUsed: async () => {},
          },
          pairingManager: new PairingManager(),
          authFailureLockout: new AuthFailureLockout(3, 60_000, 300_000),
          readLimiter: new WindowedRateLimiter(60, 60_000),
          writeLimiter: new WindowedRateLimiter(10, 60 * 60_000),
          concurrencyLimiter: new ConcurrencyLimiter(4),
          send,
          dispatchBridgeCall: (clientId, action, input) => dispatchBridgeCall(clientId, action, input),
          onPairingRequested: () => {},
        };
        return deps;
      });
    });

    afterEach(async () => {
      await server.close();
      await fs.rm(tmpRoot, { recursive: true, force: true });
    });

    it("完整握手 -> call -> result 全流程通过真实 socket 往返", async () => {
      const client = net.createConnection(ipcEndpoint.endpointName);
      await new Promise<void>((resolve, reject) => {
        client.once("connect", () => resolve());
        client.once("error", reject);
      });
      const received = createLineCollector(client);

      client.write(JSON.stringify({ t: "hello", v: 1, clientId: "client-1" }) + "\n");
      await waitFor(() => received.some((m: any) => m.t === "challenge"));
      const challenge = received.find((m: any) => m.t === "challenge") as any;
      const mac = computeMac(TOKEN_HASH, challenge.nonce, ipcEndpoint.endpointName);
      client.write(JSON.stringify({ t: "auth", clientId: "client-1", mac }) + "\n");
      await waitFor(() => received.some((m: any) => m.t === "ready"));

      client.write(JSON.stringify({ t: "call", id: "req-1", action: "scripts.list", input: {} }) + "\n");
      await waitFor(() => received.some((m: any) => m.t === "result"));
      const result = received.find((m: any) => m.t === "result") as any;
      expect(result).toEqual({ t: "result", id: "req-1", ok: true, result: { scripts: [] } });

      client.end();
    });

    it("getSession 返回已建立连接对应的 SessionHandler，未知 connectionId 返回 undefined（host.ts/pairing-decision.ts 依赖此查找连接）", async () => {
      const client = net.createConnection(ipcEndpoint.endpointName);
      await new Promise<void>((resolve, reject) => {
        client.once("connect", () => resolve());
        client.once("error", reject);
      });

      await waitFor(() => lastConnectionId !== undefined);
      expect(server.getSession(lastConnectionId!)).toBeDefined();
      expect(server.getSession("unknown-connection-id")).toBeUndefined();

      client.end();
    });

    it("超大行（超过 socketLineMax）被丢弃，不影响后续消息 —— 分帧层同样不因超限而失步", async () => {
      const client = net.createConnection(ipcEndpoint.endpointName);
      await new Promise<void>((resolve, reject) => {
        client.once("connect", () => resolve());
        client.once("error", reject);
      });
      const received = createLineCollector(client);

      const hugeLine = JSON.stringify({ t: "hello", v: 1, clientId: "x".repeat(5 * 1024 * 1024) });
      client.write(hugeLine + "\n");
      client.write(JSON.stringify({ t: "hello", v: 1, clientId: "client-1" }) + "\n");

      await waitFor(() => received.some((m: any) => m.t === "challenge"));
      expect(received.some((m: any) => m.t === "challenge")).toBe(true);

      client.end();
    });

    it("格式错误的一行被丢弃，不使连接崩溃，后续消息仍能处理", async () => {
      const client = net.createConnection(ipcEndpoint.endpointName);
      await new Promise<void>((resolve, reject) => {
        client.once("connect", () => resolve());
        client.once("error", reject);
      });
      const received = createLineCollector(client);

      client.write("not valid json\n");
      client.write(JSON.stringify({ t: "hello", v: 1, clientId: "client-1" }) + "\n");
      await waitFor(() => received.some((m: any) => m.t === "challenge"));

      client.end();
    });

    it("消息拆分成多个 TCP/socket 写入片段时仍正确重组一行", async () => {
      const client = net.createConnection(ipcEndpoint.endpointName);
      await new Promise<void>((resolve, reject) => {
        client.once("connect", () => resolve());
        client.once("error", reject);
      });
      const received = createLineCollector(client);

      const line = JSON.stringify({ t: "hello", v: 1, clientId: "client-1" }) + "\n";
      const mid = Math.floor(line.length / 2);
      client.write(line.slice(0, mid));
      await new Promise((resolve) => setTimeout(resolve, 10));
      client.write(line.slice(mid));

      await waitFor(() => received.some((m: any) => m.t === "challenge"));
      client.end();
    });
  }
);
