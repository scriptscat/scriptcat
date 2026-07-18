import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { McpController } from "./controller";
import { SystemConfig } from "@App/pkg/config/config";
import { MessageQueue } from "@Packages/message/message_queue";
import { MIN_DAEMON_VERSION, type WSEnvelope } from "./types";

// Captures the relay handlers McpController registers on its Group so tests can feed decoded
// envelopes the way the offscreen McpConnect would over the wire.
function makeFakeGroup() {
  const handlers: Record<string, (params: any) => any> = {};
  return {
    group: { on: (name: string, fn: (params: any) => any) => (handlers[name] = fn) } as any,
    relayEnvelope: (env: WSEnvelope) => handlers["envelope"](env),
    relayPaired: (key: string) => handlers["paired"]({ key }),
    relayDisconnected: () => handlers["disconnected"](undefined),
  };
}

function makeConnectClient() {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
  };
}

describe("McpController", () => {
  let systemConfig: SystemConfig;
  let mq: MessageQueue;
  let bridgeHandle: ReturnType<typeof vi.fn>;
  let bridgeCancel: ReturnType<typeof vi.fn>;
  let connectClient: ReturnType<typeof makeConnectClient>;
  let fake: ReturnType<typeof makeFakeGroup>;

  beforeEach(() => {
    chrome.storage.local.clear();
    chrome.storage.sync.clear();
    chrome.storage.session.clear();
    // chrome-extension-mock keeps a process-wide runtime listener array MessageQueue registers onto
    // and never clears; under isolate:false, stale listeners from earlier files would still fire.
    (chrome.runtime as unknown as { messageListener: unknown[] }).messageListener.length = 0;
    (chrome.runtime as unknown as { connectListener: unknown[] }).connectListener.length = 0;
    mq = new MessageQueue();
    systemConfig = new SystemConfig(mq);
    bridgeHandle = vi.fn().mockResolvedValue({ requestId: "r1", ok: true, result: {} });
    bridgeCancel = vi.fn().mockResolvedValue(undefined);
    connectClient = makeConnectClient();
    fake = makeFakeGroup();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function makeController(saveMock?: ReturnType<typeof vi.fn>) {
    return new McpController(
      systemConfig,
      { handle: bridgeHandle, cancel: bridgeCancel } as any,
      mq,
      fake.group,
      connectClient,
      saveMock ? ({ save: saveMock } as any) : undefined
    );
  }

  async function initPaired(key = "deadbeef", clientId = "c-existing") {
    systemConfig.setMcpPairing({ key, clientId });
    const controller = makeController();
    await controller.initialize();
    return controller;
  }

  it("initialize() 在 mcp_enabled=false 时只注册监听，不建立连接", async () => {
    const controller = makeController();
    await controller.initialize();
    expect(connectClient.connect).not.toHaveBeenCalled();
    expect(controller.getStatus()).toBe("disabled");
  });

  it("已启用但尚未配对时不拨号，状态为 connecting", async () => {
    const controller = makeController();
    await controller.initialize();
    systemConfig.setMcpEnabled(true);
    await vi.waitFor(() => expect(controller.getStatus()).toBe("connecting"));
    expect(connectClient.connect).not.toHaveBeenCalled();
  });

  it("已配对且 mcp_enabled 变为 true 时以会话模式拨号，携带 URL 与长期密钥", async () => {
    await initPaired("abc123", "cid");
    systemConfig.setMcpEnabled(true);
    await vi.waitFor(() => expect(connectClient.connect).toHaveBeenCalledTimes(1));
    expect(connectClient.connect).toHaveBeenCalledWith({
      url: "ws://127.0.0.1:8643",
      auth: { mode: "session", key: "abc123" },
    });
  });

  it("pair(code) 以配对模式拨号，携带配对码", async () => {
    const controller = makeController();
    await controller.initialize();
    await controller.pair("MNBV-3456");
    expect(connectClient.connect).toHaveBeenCalledWith({
      url: "ws://127.0.0.1:8643",
      auth: { mode: "pairing", code: "MNBV-3456" },
    });
    expect(controller.getStatus()).toBe("connecting");
  });

  it("hello：daemon 版本低于 MIN_DAEMON_VERSION 时 host_outdated，且不派发桥接请求", async () => {
    const controller = makeController();
    await controller.initialize();

    fake.relayEnvelope({
      v: 1,
      type: "hello",
      requestId: "h1",
      payload: { daemonVersion: "0.0.1", protocolVersion: 1 },
    });
    expect(controller.getStatus()).toBe("host_outdated");

    fake.relayEnvelope({
      v: 1,
      type: "bridge.request",
      requestId: "req-1",
      payload: { requestId: "req-1", protocolVersion: 1, clientId: "c1", action: "scripts.list", input: {} },
    });
    expect(bridgeHandle).not.toHaveBeenCalled();
  });

  it("hello：daemon 版本达标时 connected，桥接请求派发并回发 bridge.response", async () => {
    const controller = makeController();
    await controller.initialize();

    fake.relayEnvelope({
      v: 1,
      type: "hello",
      requestId: "h1",
      payload: { daemonVersion: MIN_DAEMON_VERSION, protocolVersion: 1 },
    });
    expect(controller.getStatus()).toBe("connected");

    fake.relayEnvelope({
      v: 1,
      type: "bridge.request",
      requestId: "req-1",
      payload: { requestId: "req-1", protocolVersion: 1, clientId: "c1", action: "scripts.list", input: {} },
    });
    await vi.waitFor(() => expect(bridgeHandle).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(connectClient.send).toHaveBeenCalledTimes(1));
    expect(connectClient.send).toHaveBeenCalledWith({
      v: 1,
      type: "bridge.response",
      requestId: "req-1",
      payload: { requestId: "r1", ok: true, result: {} },
    });
  });

  it("bridge.handle 返回 null（挂起）时不回发任何 bridge.response", async () => {
    bridgeHandle.mockResolvedValue(null);
    const controller = makeController();
    await controller.initialize();
    fake.relayEnvelope({
      v: 1,
      type: "hello",
      requestId: "h1",
      payload: { daemonVersion: MIN_DAEMON_VERSION, protocolVersion: 1 },
    });
    fake.relayEnvelope({
      v: 1,
      type: "bridge.request",
      requestId: "req-1",
      payload: { requestId: "req-1", protocolVersion: 1, clientId: "c1", action: "scripts.install.request", input: {} },
    });
    await vi.waitFor(() => expect(bridgeHandle).toHaveBeenCalledTimes(1));
    const responseSent = connectClient.send.mock.calls.some((call) => call[0].type === "bridge.response");
    expect(responseSent).toBe(false);
  });

  it("收到 bridge.cancel 时调用 bridge.cancel 作废对应请求，且不回发 bridge.response", async () => {
    const controller = makeController();
    await controller.initialize();
    fake.relayEnvelope({ v: 1, type: "bridge.cancel", requestId: "x", payload: { requestId: "req-dead" } });
    await vi.waitFor(() => expect(bridgeCancel).toHaveBeenCalledWith("req-dead"));
    const responseSent = connectClient.send.mock.calls.some((call) => call[0].type === "bridge.response");
    expect(responseSent).toBe(false);
  });

  it("sendBridgeResponse 经 connectClient.send 回发 bridge.response（决策/作废事件驱动）", async () => {
    const controller = makeController();
    await controller.initialize();
    controller.sendBridgeResponse("req-42", { requestId: "req-42", ok: true, result: { installed: true } });
    expect(connectClient.send).toHaveBeenCalledWith({
      v: 1,
      type: "bridge.response",
      requestId: "req-42",
      payload: { requestId: "req-42", ok: true, result: { installed: true } },
    });
  });

  it("paired：持久化 daemon 下发的长期密钥并保留既有客户端身份", async () => {
    systemConfig.setMcpPairing({ key: "old", clientId: "stable-id" });
    const controller = makeController();
    await controller.initialize();

    await fake.relayPaired("newkey");
    const pairing = await systemConfig.getMcpPairing();
    expect(pairing.key).toBe("newkey");
    expect(pairing.clientId).toBe("stable-id");
  });

  it("paired：首次配对无既有身份时生成一个客户端身份", async () => {
    const controller = makeController();
    await controller.initialize();
    await fake.relayPaired("firstkey");
    const pairing = await systemConfig.getMcpPairing();
    expect(pairing.key).toBe("firstkey");
    expect(pairing.clientId).not.toBe("");
  });

  it("disconnected：非 disabled 状态下转为 host_unreachable", async () => {
    const controller = makeController();
    await controller.initialize();
    fake.relayEnvelope({
      v: 1,
      type: "hello",
      requestId: "h1",
      payload: { daemonVersion: "0.1.0", protocolVersion: 1 },
    });
    expect(controller.getStatus()).toBe("connected");
    fake.relayDisconnected();
    expect(controller.getStatus()).toBe("host_unreachable");
  });

  it("mcp_enabled 变为 false 时发送 bridge.shutdown、断开连接、状态 disabled，且 disconnected 不再改状态", async () => {
    const controller = await initPaired();
    systemConfig.setMcpEnabled(true);
    await vi.waitFor(() => expect(connectClient.connect).toHaveBeenCalledTimes(1));

    systemConfig.setMcpEnabled(false);
    await vi.waitFor(() => expect(connectClient.disconnect).toHaveBeenCalled());
    const shutdownCall = connectClient.send.mock.calls.find((call) => call[0].type === "bridge.shutdown");
    expect(shutdownCall).toBeDefined();
    expect(controller.getStatus()).toBe("disabled");

    fake.relayDisconnected();
    expect(controller.getStatus()).toBe("disabled");
  });

  it("收到 pair.request 后记录待处理配对并广播 mcpPairingRequested", async () => {
    const controller = makeController();
    await controller.initialize();

    const events: unknown[] = [];
    mq.subscribe("mcpPairingRequested", (data) => events.push(data));

    fake.relayEnvelope({
      v: 1,
      type: "pair.request",
      requestId: "p1",
      payload: {
        pairingId: "pair-1",
        clientName: "Claude Desktop",
        requestedScopes: ["scripts:list"],
        code: "ABCD1234",
      },
    });

    expect(controller.getPendingPairing()).toMatchObject({ pairingId: "pair-1", clientName: "Claude Desktop" });
    await vi.waitFor(() => expect(events).toContainEqual({ pairingId: "pair-1" }));
  });

  it("options 页面未打开时，pair.request 会打开 mcp_confirm 弹窗（兜底路径）", async () => {
    (chrome.tabs as any).query = vi.fn().mockResolvedValue([]);
    const createMock = vi.fn().mockResolvedValue({ id: 42 });
    (chrome.tabs as any).create = createMock;
    (chrome.tabs as any).get = vi.fn().mockResolvedValue(undefined);

    const controller = makeController();
    await controller.initialize();

    fake.relayEnvelope({
      v: 1,
      type: "pair.request",
      requestId: "p1",
      payload: {
        pairingId: "pair-1",
        clientName: "Claude Desktop",
        requestedScopes: ["scripts:list"],
        code: "ABCD1234",
      },
    });

    await vi.waitFor(() => expect(createMock).toHaveBeenCalled());
    expect(createMock.mock.calls[0][0].url).toContain("src/mcp_confirm.html?pairing=pair-1");
  });

  it("options 页面已打开时，pair.request 不再打开弹窗——只广播供页面内 Dialog 消费", async () => {
    const queryMock = vi.fn().mockResolvedValue([{ id: 7, url: "chrome-extension://abc/src/options.html" }]);
    (chrome.tabs as any).query = queryMock;
    const createMock = vi.fn().mockResolvedValue({ id: 42 });
    (chrome.tabs as any).create = createMock;

    const controller = makeController();
    await controller.initialize();

    fake.relayEnvelope({
      v: 1,
      type: "pair.request",
      requestId: "p1",
      payload: {
        pairingId: "pair-1",
        clientName: "Claude Desktop",
        requestedScopes: ["scripts:list"],
        code: "ABCD1234",
      },
    });

    await vi.waitFor(() => expect(queryMock).toHaveBeenCalled());
    expect(createMock).not.toHaveBeenCalled();
  });

  it("配对超过 2 分钟 TTL 后 getPendingPairing 返回 undefined", async () => {
    vi.useFakeTimers();
    const controller = makeController();
    await controller.initialize();

    fake.relayEnvelope({
      v: 1,
      type: "pair.request",
      requestId: "p1",
      payload: {
        pairingId: "pair-1",
        clientName: "Claude Desktop",
        requestedScopes: ["scripts:list"],
        code: "ABCD1234",
      },
    });
    expect(controller.getPendingPairing()).toBeDefined();

    vi.advanceTimersByTime(2 * 60_000 + 1);
    expect(controller.getPendingPairing()).toBeUndefined();
  });

  it("decidePairing 发送 pair.decision 并清空待处理配对", async () => {
    const controller = makeController();
    await controller.initialize();

    fake.relayEnvelope({
      v: 1,
      type: "pair.request",
      requestId: "p1",
      payload: {
        pairingId: "pair-1",
        clientName: "Claude Desktop",
        requestedScopes: ["scripts:list"],
        code: "ABCD1234",
      },
    });

    controller.decidePairing("pair-1", true, ["scripts:list"]);
    const decisionCall = connectClient.send.mock.calls.find((call) => call[0].type === "pair.decision");
    expect(decisionCall?.[0].payload).toEqual({ pairingId: "pair-1", approved: true, grantedScopes: ["scripts:list"] });
    expect(controller.getPendingPairing()).toBeUndefined();
  });

  it("notifyClientRevoked 发送 client.revoke", async () => {
    const controller = makeController();
    await controller.initialize();
    controller.notifyClientRevoked("c1");
    const revokeCall = connectClient.send.mock.calls.find((call) => call[0].type === "client.revoke");
    expect(revokeCall?.[0].payload).toEqual({ clientId: "c1" });
  });

  it("收到 client.sync 后将主机侧客户端列表镜像写入 McpClientDAO", async () => {
    const saveMock = vi.fn().mockResolvedValue(undefined);
    const controller = makeController(saveMock);
    await controller.initialize();

    const client = {
      clientId: "c1",
      displayName: "Claude Desktop",
      tokenHash: "hash1",
      scopes: ["scripts:list"],
      createdAt: 1,
      lastUsedAt: 1,
      revoked: false,
    };
    fake.relayEnvelope({ v: 1, type: "client.sync", requestId: "s1", payload: [client] });
    await vi.waitFor(() => expect(saveMock).toHaveBeenCalledWith(client));
  });

  it("写会话标志存放于 chrome.storage.session，模拟重启后不再存在", async () => {
    const controller = makeController();
    controller.setWriteSessionActive(true);
    expect(controller.isWriteSessionActive()).toBe(true);
    const sessionData = await chrome.storage.session.get("mcp_write_session");
    expect(sessionData["mcp_write_session"]).toBe(true);

    await chrome.storage.session.clear();
    const freshController = makeController();
    expect(await freshController.readWriteSessionActive()).toBe(false);
  });
});
