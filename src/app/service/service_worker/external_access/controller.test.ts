import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ExternalAccessController } from "./controller";
import { SystemConfig } from "@App/pkg/config/config";
import { MessageQueue } from "@Packages/message/message_queue";
import { MIN_DAEMON_VERSION, type WSEnvelope } from "./types";

// Captures the relay handlers ExternalAccessController registers on its Group so tests can feed decoded
// envelopes the way the offscreen ExternalAccessConnect would over the wire.
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

const DEFAULT_URL = "ws://localhost:8643";

describe("ExternalAccessController（外部接入 · 扁平信任）", () => {
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

  function makeController() {
    return new ExternalAccessController(
      systemConfig,
      { handle: bridgeHandle, cancel: bridgeCancel } as any,
      mq,
      fake.group,
      connectClient
    );
  }

  async function initEnrolled(key = "deadbeef", clientId = "c-existing") {
    systemConfig.setExternalAccessPairing({ key, clientId });
    const controller = makeController();
    await controller.initialize();
    return controller;
  }

  it("external_access_enabled=false 时只注册监听，不建立连接", async () => {
    const controller = makeController();
    await controller.initialize();
    expect(connectClient.connect).not.toHaveBeenCalled();
    expect(controller.getStatus().status).toBe("disabled");
  });

  it("已启用但未接入时不拨号，状态为 pending_enrollment", async () => {
    const controller = makeController();
    await controller.initialize();
    systemConfig.setExternalAccessEnabled(true);
    await vi.waitFor(() => expect(controller.getStatus().status).toBe("pending_enrollment"));
    expect(connectClient.connect).not.toHaveBeenCalled();
  });

  it("已接入且 external_access_enabled 变为 true 时以会话模式拨号，携带 URL 与长期密钥", async () => {
    await initEnrolled("abc123", "cid");
    systemConfig.setExternalAccessEnabled(true);
    await vi.waitFor(() => expect(connectClient.connect).toHaveBeenCalledTimes(1));
    expect(connectClient.connect).toHaveBeenCalledWith({ url: DEFAULT_URL, auth: { mode: "session", key: "abc123" } });
  });

  it("enroll(code) 以配对模式拨号", async () => {
    const controller = makeController();
    await controller.initialize();
    await controller.enroll("PAIR-CODE");
    expect(connectClient.connect).toHaveBeenCalledWith({
      url: DEFAULT_URL,
      auth: { mode: "pairing", code: "PAIR-CODE" },
    });
    expect(controller.getStatus().status).toBe("connecting");
  });

  it("接入成功（paired）时持久化长期密钥 K", async () => {
    const controller = makeController();
    await controller.initialize();
    fake.relayPaired("newkey");
    await vi.waitFor(async () => expect((await systemConfig.getExternalAccessPairing()).key).toBe("newkey"));
  });

  it("hello 版本达标时 connected 并暴露 sctl 版本，过旧时 host_outdated 且不分发 bridge 调用", async () => {
    const controller = await initEnrolled();
    fake.relayEnvelope({
      v: 1,
      type: "hello",
      requestId: "h",
      payload: { daemonVersion: MIN_DAEMON_VERSION, protocolVersion: 1 },
    });
    // hello 携带 daemonVersion，状态条据此显示「sctl v{daemonVersion}」。
    expect(controller.getStatus()).toEqual({ status: "connected", daemonVersion: MIN_DAEMON_VERSION });

    fake.relayEnvelope({
      v: 1,
      type: "hello",
      requestId: "h",
      payload: { daemonVersion: "0.0.1", protocolVersion: 1 },
    });
    expect(controller.getStatus()).toEqual({ status: "host_outdated", daemonVersion: "0.0.1" });
    fake.relayEnvelope({
      v: 1,
      type: "bridge.request",
      requestId: "req",
      payload: { action: "scripts.list", input: {}, clientId: "x", protocolVersion: 1 },
    });
    expect(bridgeHandle).not.toHaveBeenCalled();
  });

  it("bridge.request 用 envelope 的 requestId 回填并回发 bridge.response", async () => {
    await initEnrolled();
    fake.relayEnvelope({
      v: 1,
      type: "hello",
      requestId: "h",
      payload: { daemonVersion: MIN_DAEMON_VERSION, protocolVersion: 1 },
    });
    fake.relayEnvelope({
      v: 1,
      type: "bridge.request",
      requestId: "req-42",
      payload: { action: "scripts.list", input: {}, clientId: "x", protocolVersion: 1 },
    });
    await vi.waitFor(() => expect(bridgeHandle).toHaveBeenCalled());
    expect(bridgeHandle.mock.calls[0][0].requestId).toBe("req-42");
    await vi.waitFor(() =>
      expect(connectClient.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: "bridge.response", requestId: "req-42" })
      )
    );
  });

  it("bridge.request 挂起（handle 返回 null）时不回发响应", async () => {
    bridgeHandle.mockResolvedValue(null);
    await initEnrolled();
    fake.relayEnvelope({
      v: 1,
      type: "hello",
      requestId: "h",
      payload: { daemonVersion: MIN_DAEMON_VERSION, protocolVersion: 1 },
    });
    fake.relayEnvelope({
      v: 1,
      type: "bridge.request",
      requestId: "req",
      payload: { action: "scripts.install.request", input: { code: "x" }, clientId: "x", protocolVersion: 1 },
    });
    await vi.waitFor(() => expect(bridgeHandle).toHaveBeenCalled());
    expect(connectClient.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "bridge.response" }));
  });

  it("bridge.cancel 按 envelope 的 requestId 作废挂起操作", async () => {
    await initEnrolled();
    fake.relayEnvelope({ v: 1, type: "bridge.cancel", requestId: "req-cancel", payload: {} });
    expect(bridgeCancel).toHaveBeenCalledWith("req-cancel");
  });

  it("socket 断开时状态转为 host_unreachable 并清除 sctl 版本", async () => {
    const controller = await initEnrolled();
    fake.relayEnvelope({
      v: 1,
      type: "hello",
      requestId: "h",
      payload: { daemonVersion: MIN_DAEMON_VERSION, protocolVersion: 1 },
    });
    fake.relayDisconnected();
    // 断开后不再连接，之前 hello 报告的版本不应残留。
    expect(controller.getStatus()).toEqual({ status: "host_unreachable", daemonVersion: undefined });
  });

  it("stop() 发送 shutdown、断开并置为 disabled", async () => {
    const controller = await initEnrolled();
    controller.stop();
    expect(connectClient.send).toHaveBeenCalledWith(expect.objectContaining({ type: "bridge.shutdown" }));
    expect(connectClient.disconnect).toHaveBeenCalled();
    expect(controller.getStatus().status).toBe("disabled");
  });
});
