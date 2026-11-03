import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ExternalAccessController } from "./controller";
import { SystemConfig } from "@App/pkg/config/config";
import { MessageQueue } from "@Packages/message/message_queue";
import type { WSEnvelope } from "./types";
import { mockIdentityLock } from "./test-locks";
import * as browserUtils from "@App/pkg/utils/utils";

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
    mockIdentityLock();
    vi.spyOn(chrome.runtime, "getManifest").mockReturnValue({ ...chrome.runtime.getManifest(), version: "1.5.0" });
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

  async function initEnrolled(key = "deadbeef") {
    systemConfig.setExternalAccessPairing({ key });
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
    await initEnrolled("abc123");
    systemConfig.setExternalAccessEnabled(true);
    await vi.waitFor(() => expect(connectClient.connect).toHaveBeenCalledTimes(1));
    expect(connectClient.connect).toHaveBeenCalledWith({
      url: DEFAULT_URL,
      auth: { mode: "session", key: "abc123" },
      instanceId: (await systemConfig.getExternalAccessIdentity()).instanceId,
    });
  });

  describe("隐身（split）进程", () => {
    // split 模式下隐身进程与普通进程共用 chrome.storage.local 里的密钥和脚本，它再连一次只会与普通进程互相顶替（sctl#14）。
    const extension = chrome.extension as unknown as { inIncognitoContext: boolean };

    beforeEach(() => {
      extension.inIncognitoContext = true;
    });

    afterEach(() => {
      extension.inIncognitoContext = false;
    });

    it("已启用且已接入时启动也不拨号，状态保持 disabled", async () => {
      systemConfig.setExternalAccessEnabled(true);
      const controller = await initEnrolled("abc123");
      expect(connectClient.connect).not.toHaveBeenCalled();
      expect(controller.getStatus().status).toBe("disabled");
    });

    it("enroll(code) 不以配对模式拨号", async () => {
      const controller = makeController();
      await controller.initialize();
      await controller.enroll("PAIR-CODE");
      expect(connectClient.connect).not.toHaveBeenCalled();
      expect(controller.getStatus().status).toBe("disabled");
    });
  });

  it("enroll(code) 以配对模式拨号", async () => {
    const controller = makeController();
    await controller.initialize();
    await controller.enroll("PAIR-CODE");
    expect(connectClient.connect).toHaveBeenCalledWith({
      url: DEFAULT_URL,
      auth: { mode: "pairing", code: "PAIR-CODE" },
      instanceId: (await systemConfig.getExternalAccessIdentity()).instanceId,
    });
    expect(controller.getStatus().status).toBe("connecting");
  });

  it.each(["Chrome", "Edge", "Firefox", "Safari", undefined])("能力声明包含名称与 %s 产品信息", async (product) => {
    vi.spyOn(browserUtils, "getBrowserType").mockReturnValue({
      firefox: Number(product === "Firefox"),
      webkit: Number(product === "Safari"),
      chrome: product === "Edge" ? browserUtils.BrowserType.Edge : Number(product === "Chrome"),
      unknown: Number(!product),
      chromeVersion: 0,
      device: 0,
    });
    vi.spyOn(browserUtils, "getBrowserVersion").mockReturnValue(product ? 129 : 0);
    await initEnrolled();
    await fake.relayEnvelope({ jsonrpc: "2.0", method: "$session.hello", params: { daemonVersion: "1" } });
    const identity = await systemConfig.getExternalAccessIdentity();
    expect(connectClient.send).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "$session.capabilities",
        params: expect.objectContaining({
          schemaVersion: expect.any(String),
          methods: expect.any(Array),
          peer: {
            name: identity.name,
            ...(product ? { product, productVersion: "129" } : {}),
            extensionVersion: chrome.runtime.getManifest().version,
          },
        }),
      })
    );
  });

  it.each([63, 64, 65])("能力声明自报文本在 %i UTF-8 字节边界不拆字符", async (bytes) => {
    const text = "a".repeat(bytes - 4) + "😀";
    vi.spyOn(chrome.runtime, "getManifest").mockReturnValue({ ...chrome.runtime.getManifest(), version: text });
    vi.spyOn(browserUtils, "getBrowserVersion").mockReturnValue(Number.NaN);
    await chrome.storage.local.set({ system_external_access_identity: { instanceId: "ab".repeat(16), name: text } });
    await initEnrolled();
    await fake.relayEnvelope({ jsonrpc: "2.0", method: "$session.hello", params: { daemonVersion: "1" } });
    const peer = connectClient.send.mock.calls[0][0].params.peer;
    const expected = bytes <= 64 ? text : "a".repeat(bytes - 4);
    expect(peer.name).toBe(expected);
    expect(peer.extensionVersion).toBe(expected);
    expect(peer).not.toHaveProperty("productVersion");
  });

  it("接入成功（paired）时持久化长期密钥 K", async () => {
    const controller = makeController();
    await controller.initialize();
    fake.relayPaired("newkey");
    await vi.waitFor(async () => expect((await systemConfig.getExternalAccessPairing()).key).toBe("newkey"));
  });

  it("hello 只展示 daemon 版本，不按产品版本阻断兼容的 bridge 调用", async () => {
    const controller = await initEnrolled();
    await fake.relayEnvelope({
      jsonrpc: "2.0",
      method: "$session.hello",
      params: { daemonVersion: "0.1.0" },
    });
    // hello 携带 daemonVersion，状态条据此显示「sctl v{daemonVersion}」。
    expect(controller.getStatus()).toEqual({ status: "connected", daemonVersion: "0.1.0" });

    await fake.relayEnvelope({
      jsonrpc: "2.0",
      method: "$session.hello",
      params: { daemonVersion: "0.0.1" },
    });
    expect(controller.getStatus()).toEqual({ status: "connected", daemonVersion: "0.0.1" });
    fake.relayEnvelope({
      jsonrpc: "2.0",
      id: "req",
      method: "scripts.list",
      params: { input: {}, clientId: "x" },
    });
    await vi.waitFor(() => expect(bridgeHandle).toHaveBeenCalled());
  });

  it("JSON-RPC request uses id to correlate the response", async () => {
    await initEnrolled();
    await fake.relayEnvelope({
      jsonrpc: "2.0",
      method: "$session.hello",
      params: { daemonVersion: "0.1.0" },
    });
    fake.relayEnvelope({
      jsonrpc: "2.0",
      id: "req-42",
      method: "scripts.list",
      params: { input: {}, clientId: "x" },
    });
    await vi.waitFor(() => expect(bridgeHandle).toHaveBeenCalled());
    expect(bridgeHandle.mock.calls[0][0].requestId).toBe("req-42");
    await vi.waitFor(() =>
      expect(connectClient.send).toHaveBeenCalledWith(
        expect.objectContaining({ jsonrpc: "2.0", id: "req-42", result: {} })
      )
    );
  });

  it("a suspended JSON-RPC request does not respond before the decision", async () => {
    bridgeHandle.mockResolvedValue(null);
    await initEnrolled();
    await fake.relayEnvelope({
      jsonrpc: "2.0",
      method: "$session.hello",
      params: { daemonVersion: "0.1.0" },
    });
    fake.relayEnvelope({
      jsonrpc: "2.0",
      id: "req",
      method: "scripts.install.request",
      params: { input: { code: "x" }, clientId: "x" },
    });
    await vi.waitFor(() => expect(bridgeHandle).toHaveBeenCalled());
    expect(connectClient.send).not.toHaveBeenCalledWith(expect.objectContaining({ id: "req" }));
  });

  it("$/cancelRequest cancels the referenced request id", async () => {
    await initEnrolled();
    fake.relayEnvelope({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id: "req-cancel" } });
    expect(bridgeCancel).toHaveBeenCalledWith("req-cancel");
  });

  it("socket 断开时状态转为 host_unreachable 并清除 sctl 版本", async () => {
    const controller = await initEnrolled();
    await fake.relayEnvelope({
      jsonrpc: "2.0",
      method: "$session.hello",
      params: { daemonVersion: "0.1.0" },
    });
    fake.relayDisconnected();
    expect(bridgeCancel).toHaveBeenCalledWith();
    // 断开后不再连接，之前 hello 报告的版本不应残留。
    expect(controller.getStatus()).toEqual({ status: "host_unreachable", daemonVersion: undefined });
  });

  it("stop() 发送 shutdown、断开并置为 disabled", async () => {
    const controller = await initEnrolled();
    controller.stop();
    expect(bridgeCancel).toHaveBeenCalledWith();
    expect(connectClient.send).toHaveBeenCalledWith(
      expect.objectContaining({ jsonrpc: "2.0", method: "$session.shutdown" })
    );
    expect(connectClient.disconnect).toHaveBeenCalled();
    expect(controller.getStatus().status).toBe("disabled");
  });
});
