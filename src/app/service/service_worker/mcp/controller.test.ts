import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { McpController, NATIVE_HOST_NAME } from "./controller";
import { SystemConfig } from "@App/pkg/config/config";
import { MessageQueue } from "@Packages/message/message_queue";
import { MIN_HOST_VERSION } from "./types";

function makeFakePort() {
  const messageListeners: Array<(msg: any) => void> = [];
  const disconnectListeners: Array<() => void> = [];
  return {
    postMessage: vi.fn(),
    disconnect: vi.fn(() => {
      disconnectListeners.forEach((cb) => cb());
    }),
    onMessage: { addListener: (cb: (msg: any) => void) => messageListeners.push(cb) },
    onDisconnect: { addListener: (cb: () => void) => disconnectListeners.push(cb) },
    __emitMessage(msg: any) {
      messageListeners.forEach((cb) => cb(msg));
    },
    __emitDisconnect() {
      disconnectListeners.forEach((cb) => cb());
    },
  };
}

describe("McpController", () => {
  let systemConfig: SystemConfig;
  let mq: MessageQueue;
  let bridgeHandle: ReturnType<typeof vi.fn>;
  let connectNativeMock: ReturnType<typeof vi.fn>;
  let ports: ReturnType<typeof makeFakePort>[];

  beforeEach(() => {
    chrome.storage.local.clear();
    chrome.storage.sync.clear();
    // chrome-extension-mock's Runtime keeps a single process-wide listener array that MessageQueue
    // instances register onto in their constructor and never unregister; under this project's
    // isolate:false test pool, stale listeners from earlier test files in the same worker would
    // otherwise still fire (and — since chrome.runtime.connectNative is reassigned fresh below —
    // route into *this* test's mock), inflating call counts. Reset before each test.
    (chrome.runtime as unknown as { messageListener: unknown[] }).messageListener.length = 0;
    (chrome.runtime as unknown as { connectListener: unknown[] }).connectListener.length = 0;
    mq = new MessageQueue();
    systemConfig = new SystemConfig(mq);
    bridgeHandle = vi.fn().mockResolvedValue({ requestId: "r1", ok: true, result: {} });
    ports = [];
    connectNativeMock = vi.fn(() => {
      const port = makeFakePort();
      ports.push(port);
      return port;
    });
    (chrome.runtime as any).connectNative = connectNativeMock;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function makeController() {
    return new McpController(systemConfig, { handle: bridgeHandle } as any, mq);
  }

  it("initialize() 在 mcp_enabled=false 时只注册监听，不建立连接", async () => {
    const controller = makeController();
    await controller.initialize();
    expect(connectNativeMock).not.toHaveBeenCalled();
    expect(controller.getStatus()).toBe("disabled");
  });

  it("mcp_enabled 由 false 变为 true 时恰好调用一次 connectNative", async () => {
    const controller = makeController();
    await controller.initialize();
    systemConfig.setMcpEnabled(true);
    await vi.waitFor(() => expect(connectNativeMock).toHaveBeenCalledTimes(1));
    expect(connectNativeMock).toHaveBeenCalledWith(NATIVE_HOST_NAME);
  });

  it("mcp_enabled 由 true 变为 false 时断开端口、发送 bridge.shutdown，状态变为 disabled", async () => {
    const controller = makeController();
    await controller.initialize();
    systemConfig.setMcpEnabled(true);
    await vi.waitFor(() => expect(connectNativeMock).toHaveBeenCalledTimes(1));

    systemConfig.setMcpEnabled(false);
    await vi.waitFor(() => expect(ports[0].disconnect).toHaveBeenCalled());
    const shutdownCall = ports[0].postMessage.mock.calls.find((call) => call[0].type === "bridge.shutdown");
    expect(shutdownCall).toBeDefined();
    expect(controller.getStatus()).toBe("disabled");
  });

  it("断线后按封顶指数退避重连,达到上限后状态变为 host_unreachable 且不再重试", async () => {
    vi.useFakeTimers();
    const controller = makeController();
    await controller.initialize();
    systemConfig.setMcpEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(connectNativeMock).toHaveBeenCalledTimes(1);

    // Simulate 5 consecutive connect failures (disconnect immediately each time).
    for (let i = 0; i < 5; i++) {
      ports[ports.length - 1].__emitDisconnect();
      const expectedDelay = Math.min(1000 * 2 ** i, 60_000);
      await vi.advanceTimersByTimeAsync(expectedDelay);
    }

    // 5 reconnect attempts scheduled -> 1 initial + 5 = 6 total connectNative calls, then give up.
    expect(connectNativeMock).toHaveBeenCalledTimes(6);
    ports[ports.length - 1].__emitDisconnect();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(connectNativeMock).toHaveBeenCalledTimes(6);
    expect(controller.getStatus()).toBe("host_unreachable");
  });

  it("主机版本低于 MIN_HOST_VERSION 时状态为 host_outdated，且不再派发桥接请求", async () => {
    const controller = makeController();
    await controller.initialize();
    systemConfig.setMcpEnabled(true);
    await vi.waitFor(() => expect(connectNativeMock).toHaveBeenCalledTimes(1));

    ports[0].__emitMessage({
      v: 1,
      type: "hello",
      requestId: "h1",
      payload: { daemonVersion: "0.0.1" },
    });
    expect(controller.getStatus()).toBe("host_outdated");

    ports[0].__emitMessage({
      v: 1,
      type: "bridge.request",
      requestId: "req-1",
      payload: { requestId: "req-1", protocolVersion: 1, clientId: "c1", action: "scripts.list", input: {} },
    });
    expect(bridgeHandle).not.toHaveBeenCalled();
  });

  it("主机版本达到 MIN_HOST_VERSION 时状态为 connected，正常派发桥接请求", async () => {
    const controller = makeController();
    await controller.initialize();
    systemConfig.setMcpEnabled(true);
    await vi.waitFor(() => expect(connectNativeMock).toHaveBeenCalledTimes(1));

    ports[0].__emitMessage({
      v: 1,
      type: "hello",
      requestId: "h1",
      payload: { daemonVersion: MIN_HOST_VERSION },
    });
    expect(controller.getStatus()).toBe("connected");

    ports[0].__emitMessage({
      v: 1,
      type: "bridge.request",
      requestId: "req-1",
      payload: { requestId: "req-1", protocolVersion: 1, clientId: "c1", action: "scripts.list", input: {} },
    });
    await vi.waitFor(() => expect(bridgeHandle).toHaveBeenCalledTimes(1));
  });

  it("收到 pair.request 后记录待处理配对并广播 mcpPairingRequested", async () => {
    const controller = makeController();
    await controller.initialize();
    systemConfig.setMcpEnabled(true);
    await vi.waitFor(() => expect(connectNativeMock).toHaveBeenCalledTimes(1));

    const events: unknown[] = [];
    mq.subscribe("mcpPairingRequested", (data) => events.push(data));

    ports[0].__emitMessage({
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
    const queryMock = vi.fn().mockResolvedValue([]);
    (chrome.tabs as any).query = queryMock;
    const createMock = vi.fn().mockResolvedValue({ id: 42 });
    (chrome.tabs as any).create = createMock;
    (chrome.tabs as any).get = vi.fn().mockResolvedValue(undefined);

    const controller = makeController();
    await controller.initialize();
    systemConfig.setMcpEnabled(true);
    await vi.waitFor(() => expect(connectNativeMock).toHaveBeenCalledTimes(1));

    ports[0].__emitMessage({
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
    const createArgs = createMock.mock.calls[0][0];
    expect(createArgs.url).toContain("src/mcp_confirm.html?pairing=pair-1");
  });

  it("options 页面已打开时，pair.request 不再打开弹窗——只广播供页面内 Dialog 消费", async () => {
    const queryMock = vi.fn().mockResolvedValue([{ id: 7, url: "chrome-extension://abc/src/options.html" }]);
    (chrome.tabs as any).query = queryMock;
    const createMock = vi.fn().mockResolvedValue({ id: 42 });
    (chrome.tabs as any).create = createMock;

    const controller = makeController();
    await controller.initialize();
    systemConfig.setMcpEnabled(true);
    await vi.waitFor(() => expect(connectNativeMock).toHaveBeenCalledTimes(1));

    const events: unknown[] = [];
    mq.subscribe("mcpPairingRequested", (data) => events.push(data));

    ports[0].__emitMessage({
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

    await vi.waitFor(() => expect(events).toContainEqual({ pairingId: "pair-1" }));
    await vi.waitFor(() => expect(queryMock).toHaveBeenCalled());
    expect(createMock).not.toHaveBeenCalled();
  });

  it("配对超过 2 分钟 TTL 后 getPendingPairing 返回 undefined", async () => {
    vi.useFakeTimers();
    const controller = makeController();
    await controller.initialize();
    systemConfig.setMcpEnabled(true);
    await vi.advanceTimersByTimeAsync(0);

    ports[0].__emitMessage({
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

  it("decidePairing 向主机发送 pair.decision 并清空待处理配对", async () => {
    const controller = makeController();
    await controller.initialize();
    systemConfig.setMcpEnabled(true);
    await vi.waitFor(() => expect(connectNativeMock).toHaveBeenCalledTimes(1));

    ports[0].__emitMessage({
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

    const decisionCall = ports[0].postMessage.mock.calls.find((call) => call[0].type === "pair.decision");
    expect(decisionCall?.[0].payload).toEqual({ pairingId: "pair-1", approved: true, grantedScopes: ["scripts:list"] });
    expect(controller.getPendingPairing()).toBeUndefined();
  });

  it("收到 client.sync 后将主机侧客户端列表镜像写入 McpClientDAO", async () => {
    const saveMock = vi.fn().mockResolvedValue(undefined);
    const controller = new McpController(systemConfig, { handle: bridgeHandle } as any, mq, { save: saveMock } as any);
    await controller.initialize();
    systemConfig.setMcpEnabled(true);
    await vi.waitFor(() => expect(connectNativeMock).toHaveBeenCalledTimes(1));

    const client = {
      clientId: "c1",
      displayName: "Claude Desktop",
      tokenHash: "hash1",
      scopes: ["scripts:list"],
      createdAt: 1,
      lastUsedAt: 1,
      revoked: false,
    };
    ports[0].__emitMessage({ v: 1, type: "client.sync", requestId: "s1", payload: [client] });

    await vi.waitFor(() => expect(saveMock).toHaveBeenCalledWith(client));
  });

  it("写会话标志存放于 chrome.storage.session，模拟重启后不再存在", async () => {
    const controller = makeController();
    controller.setWriteSessionActive(true);
    expect(controller.isWriteSessionActive()).toBe(true);
    const sessionData = await chrome.storage.session.get("mcp_write_session");
    expect(sessionData["mcp_write_session"]).toBe(true);

    // Simulate a browser restart by clearing session storage (its whole point is not persisting).
    await chrome.storage.session.clear();
    const freshController = makeController();
    expect(await freshController.readWriteSessionActive()).toBe(false);
  });
});
