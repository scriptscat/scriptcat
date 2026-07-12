import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { createIpcEndpoint, type IpcEndpoint } from "../broker/ipc";
import { BrokerServer } from "../broker/server";
import type { SessionDeps, BridgeCallOutcome } from "../broker/session";
import { PairingManager } from "../auth/pairing";
import { AuthFailureLockout, ConcurrencyLimiter, WindowedRateLimiter } from "../broker/rate-limit";
import type { StoredClient } from "../auth/token-store";
import { SocketClient } from "./socket-client";

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

describe.skipIf(process.platform === "win32")("SocketClient - shim 端与真实 BrokerServer 的端到端握手/调用", () => {
  let tmpRoot: string;
  let ipcEndpoint: IpcEndpoint;
  let server: BrokerServer;
  let dispatchBridgeCall: (clientId: string, action: string, input: unknown) => Promise<BridgeCallOutcome>;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sc-mcp-shim-"));
    await fs.chmod(tmpRoot, 0o700);
    ipcEndpoint = await createIpcEndpoint(tmpRoot);
    dispatchBridgeCall = async () => ({ ok: true, result: { scripts: [] } });

    server = new BrokerServer(ipcEndpoint, (connectionId, send) => {
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

  it("authenticate() 成功后返回 scopes 与 serverInfo", async () => {
    const client = new SocketClient();
    await client.connect(ipcEndpoint.endpointName);
    const result = await client.authenticate("client-1", TOKEN_HASH, ipcEndpoint.endpointName);
    expect(result).toEqual({
      ok: true,
      scopes: ["scripts:list"],
      serverInfo: { name: "scriptcat-native-host", version: "0.1.0" },
    });
    client.disconnect();
  });

  it("错误的 tokenHash 导致 authenticate() 返回 UNAUTHENTICATED", async () => {
    const client = new SocketClient();
    await client.connect(ipcEndpoint.endpointName);
    const result = await client.authenticate("client-1", "wrong".padEnd(64, "0"), ipcEndpoint.endpointName);
    expect(result).toEqual({ ok: false, code: "UNAUTHENTICATED" });
    client.disconnect();
  });

  it("认证后 call() 正常收到 result", async () => {
    const client = new SocketClient();
    await client.connect(ipcEndpoint.endpointName);
    await client.authenticate("client-1", TOKEN_HASH, ipcEndpoint.endpointName);

    const result = await client.call("req-1", "scripts.list", {});
    expect(result).toEqual({ type: "result", id: "req-1", ok: true, result: { scripts: [] } });
    client.disconnect();
  });

  it("未认证状态下 call() 收到 UNAUTHENTICATED 错误", async () => {
    const client = new SocketClient();
    await client.connect(ipcEndpoint.endpointName);
    const result = await client.call("req-1", "scripts.list", {});
    expect(result).toEqual({
      type: "result",
      id: "req-1",
      ok: false,
      error: { code: "UNAUTHENTICATED", message: "not authenticated" },
    });
    client.disconnect();
  });

  it("requestPairing() 触发 pair_pending 事件，附带 8 位验证码", async () => {
    const client = new SocketClient();
    await client.connect(ipcEndpoint.endpointName);

    const pending = new Promise((resolve) => {
      client.onEvent((event) => {
        if (event.type === "pair_pending") resolve(event);
      });
    });
    client.requestPairing("New Client", ["scripts:list"]);
    const event = (await pending) as { type: "pair_pending"; pairingId: string; code: string };
    expect(event.code).toHaveLength(8);
    client.disconnect();
  });

  it("多次连续 call() 各自正确关联对应的 result（不串号）", async () => {
    dispatchBridgeCall = async (_clientId, action) => ({ ok: true, result: { echo: action } });
    const client = new SocketClient();
    await client.connect(ipcEndpoint.endpointName);
    await client.authenticate("client-1", TOKEN_HASH, ipcEndpoint.endpointName);

    const [r1, r2] = await Promise.all([
      client.call("req-a", "scripts.list", {}),
      client.call("req-b", "scripts.metadata.get", { uuid: "x" }),
    ]);
    expect(r1).toMatchObject({ id: "req-a", result: { echo: "scripts.list" } });
    expect(r2).toMatchObject({ id: "req-b", result: { echo: "scripts.metadata.get" } });
    client.disconnect();
  });
});
