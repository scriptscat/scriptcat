import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ExternalAccessController } from "./controller";
import { SystemConfig } from "@App/pkg/config/config";
import { MessageQueue } from "@Packages/message/message_queue";
import type { WSEnvelope } from "./types";
import { mockWebLocks } from "@Tests/mockWebLocks";
import * as browserUtils from "@App/pkg/utils/utils";

// Captures the relay handlers ExternalAccessController registers on its Group so tests can feed decoded
// envelopes the way the offscreen ExternalAccessConnect would over the wire.
function makeFakeGroup() {
  const handlers: Record<string, (params: any) => any> = {};
  return {
    group: { on: (name: string, fn: (params: any) => any) => (handlers[name] = fn) } as any,
    relayEnvelope: (env: WSEnvelope) => handlers["envelope"](env),
    established: (key?: string) => handlers["established"]({ key }),
    relayDisconnected: (reason?: "refused" | "name-taken", mode = "session") =>
      handlers["disconnected"]({ reason, mode }),
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
    mockWebLocks();
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
    expect((await controller.getStatus()).status).toBe("disabled");
  });

  it("已启用但未接入时不拨号，状态为 pending_enrollment", async () => {
    const controller = makeController();
    await controller.initialize();
    systemConfig.setExternalAccessEnabled(true);
    await vi.waitFor(async () => expect((await controller.getStatus()).status).toBe("pending_enrollment"));
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
      expect((await controller.getStatus()).status).toBe("disabled");
    });

    it("enroll(code) 不以配对模式拨号", async () => {
      const controller = makeController();
      await controller.initialize();
      await controller.enroll("PAIR-CODE", "private");
      expect(connectClient.connect).not.toHaveBeenCalled();
      expect((await controller.getStatus()).status).toBe("disabled");
    });
  });

  // scriptcat 是 sctl 为旧版 ScriptCat 保留的名称，daemon 必然拒绝；接入时发出去会白白消耗一次性配对码。
  it.each(["", "Bad", " ", "a".repeat(33), "a_b", "工作", "scriptcat"])(
    "无效名称 %j 不拨号、不改名",
    async (invalid) => {
      const controller = makeController();
      await controller.initialize();
      const { name } = await systemConfig.getExternalAccessIdentity();
      expect(await controller.enroll("code", invalid)).toBe("invalid-name");
      expect(await controller.rename(invalid)).toBe("invalid-name");
      expect(connectClient.connect).not.toHaveBeenCalled();
      expect((await controller.getStatus()).name).toBe(name);
      expect((await systemConfig.getExternalAccessIdentity()).name).toBe(name);
    }
  );

  it("未连接时改名保存到下一次连接", async () => {
    const controller = makeController();
    await controller.initialize();
    const identity = await systemConfig.getExternalAccessIdentity();
    expect(await controller.rename("work")).toBe("applies-next-connection");
    expect(await systemConfig.getExternalAccessIdentity()).toEqual({ ...identity, name: "work" });
    expect((await controller.getStatus()).name).toBe("work");
    expect(connectClient.connect).not.toHaveBeenCalled();
    systemConfig.setExternalAccessPairing({ key: "test-key" });
    systemConfig.setExternalAccessEnabled(true);
    await vi.waitFor(() => expect(connectClient.connect).toHaveBeenCalledTimes(1));
    await fake.relayEnvelope({ jsonrpc: "2.0", method: "$session.hello", params: { daemonVersion: "1" } });
    expect(connectClient.send.mock.lastCall?.[0].params.peer.name).toBe("work");
  });

  it("enroll(code) 以配对模式拨号", async () => {
    const controller = makeController();
    await controller.initialize();
    const result = controller.enroll("PAIR-CODE", "work");
    await vi.waitFor(() => expect(connectClient.connect).toHaveBeenCalled());
    expect(connectClient.connect).toHaveBeenCalledWith({
      url: DEFAULT_URL,
      auth: { mode: "pairing", code: "PAIR-CODE" },
      instanceId: (await systemConfig.getExternalAccessIdentity()).instanceId,
    });
    expect(await controller.getStatus()).toMatchObject({ status: "connecting", name: "work" });
    await fake.established("newkey");
    expect(await result).toBe("ok");
    expect(await systemConfig.getExternalAccessPairing()).toEqual({ key: "newkey" });
  });

  it.each([
    ["Chrome", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0.0.0 Safari/537.36", "129"],
    ["Edge", "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0", "129"],
    ["Firefox", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0", "130.0"],
    ["Safari", "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15", "17.4"],
    [undefined, "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/129.0.0.0 Safari/537.36", undefined],
  ])("能力声明包含名称与 %s 产品信息及浏览器版本", async (product, userAgent, productVersion) => {
    vi.spyOn(browserUtils, "getBrowserType").mockReturnValue({
      firefox: Number(product === "Firefox"),
      webkit: Number(product === "Safari"),
      chrome: product === "Edge" ? browserUtils.BrowserType.Edge : Number(product === "Chrome"),
      unknown: Number(!product),
      chromeVersion: 0,
      device: 0,
    });
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
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
            ...(product ? { product, productVersion } : {}),
            extensionVersion: chrome.runtime.getManifest().version,
          },
        }),
      })
    );
  });

  it.each([64, 65])("能力声明自报的浏览器版本截断到 64 字节（UA 中版本为 %i 字节）", async (length) => {
    vi.spyOn(browserUtils, "getBrowserType").mockReturnValue({
      firefox: 1,
      webkit: 0,
      chrome: 0,
      unknown: 0,
      chromeVersion: 0,
      device: 0,
    });
    const version = "1." + "0".repeat(length - 2);
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      `Mozilla/5.0 (X11; rv:130.0) Gecko/20100101 Firefox/${version}`
    );
    await initEnrolled();
    await fake.relayEnvelope({ jsonrpc: "2.0", method: "$session.hello", params: { daemonVersion: "1" } });
    expect(connectClient.send.mock.calls[0][0].params.peer.productVersion).toBe(version.slice(0, 64));
  });

  it("被拒后重新接入时名称冲突要求新配对码，并保留原密钥", async () => {
    systemConfig.setExternalAccessEnabled(true);
    const controller = await initEnrolled();
    const publish = vi.spyOn(mq, "publish");
    await fake.relayDisconnected("refused");
    const rejected = await controller.getStatus();
    expect(rejected).toMatchObject({ status: "rejected", reason: "refused" });
    await vi.waitFor(() => expect(publish).toHaveBeenCalledWith("mcpStatusChanged", rejected));
    const result = controller.enroll("CODE", "work");
    await vi.waitFor(() => expect(connectClient.connect).toHaveBeenCalledTimes(2));
    expect((await controller.getStatus()).status).toBe("connecting");
    await fake.relayDisconnected("name-taken", "pairing");
    expect(await result).toBe("name-taken");
    expect((await controller.getStatus()).status).toBe("pending_enrollment");
    expect(await systemConfig.getExternalAccessPairing()).toEqual({ key: "deadbeef" });
    const restarted = makeController();
    await restarted.initialize();
    expect((await restarted.getStatus()).status).toBe("pending_enrollment");
    expect(connectClient.connect).toHaveBeenCalledTimes(2);
  });

  it("接入时名称冲突恢复接入前的实例名称", async () => {
    systemConfig.setExternalAccessEnabled(true);
    const controller = await initEnrolled();
    await fake.relayDisconnected("refused");
    const before = (await systemConfig.getExternalAccessIdentity()).name;
    const result = controller.enroll("CODE", "work");
    await vi.waitFor(() => expect(connectClient.connect).toHaveBeenCalledTimes(2));
    await fake.relayDisconnected("name-taken", "pairing");
    expect(await result).toBe("name-taken");
    expect((await systemConfig.getExternalAccessIdentity()).name).toBe(before);
    expect((await controller.getStatus()).name).toBe(before);
  });

  it("SW 在配对握手期间重启，配对完成时仍保存新密钥并转为已连接", async () => {
    systemConfig.setExternalAccessEnabled(true);
    const controller = makeController();
    await controller.initialize();
    void controller.enroll("PAIR-CODE", "work");
    await vi.waitFor(() => expect(connectClient.connect).toHaveBeenCalledTimes(1));
    // 重启丢掉 SW 内存中的控制器，offscreen 里的配对连接仍在继续。
    const restarted = makeController();
    await restarted.initialize();
    expect((await restarted.getStatus()).status).toBe("pending_enrollment");
    await fake.established("newkey");
    expect(await systemConfig.getExternalAccessPairing()).toEqual({ key: "newkey" });
    expect(await restarted.getStatus()).toMatchObject({ status: "connected", name: "work" });
  });

  it("停止接入后迟到的 established 不保存密钥", async () => {
    systemConfig.setExternalAccessEnabled(true);
    const controller = makeController();
    await controller.initialize();
    void controller.enroll("PAIR-CODE", "work");
    await vi.waitFor(() => expect(connectClient.connect).toHaveBeenCalledTimes(1));
    controller.stop();
    await fake.established("newkey");
    expect(await systemConfig.getExternalAccessPairing()).toEqual({ key: "" });
    expect((await controller.getStatus()).status).toBe("disabled");
  });

  it("停止接入优先于尚未落盘的拒绝通知", async () => {
    systemConfig.setExternalAccessEnabled(true);
    const controller = await initEnrolled();
    const disconnected = fake.relayDisconnected("refused");
    controller.stop();
    await disconnected;
    expect((await controller.getStatus()).status).toBe("disabled");
  });

  it("SW 重新启动不会自动重试已拒绝的实例", async () => {
    systemConfig.setExternalAccessEnabled(true);
    await initEnrolled();
    await fake.relayDisconnected("refused");
    const restarted = makeController();
    await restarted.initialize();
    expect(await restarted.getStatus()).toMatchObject({ status: "rejected", reason: "refused" });
    expect(connectClient.connect).toHaveBeenCalledTimes(1);
  });

  it.each(["toggle", "rename"])("被拒后 %s 重新拨号", async (action) => {
    systemConfig.setExternalAccessEnabled(true);
    const controller = await initEnrolled();
    await fake.relayDisconnected("name-taken");
    expect(await controller.getStatus()).toMatchObject({ status: "rejected", reason: "name-taken" });
    if (action === "toggle") {
      systemConfig.setExternalAccessEnabled(false);
      await vi.waitFor(async () => expect((await controller.getStatus()).status).toBe("disabled"));
      systemConfig.setExternalAccessEnabled(true);
    } else expect(await controller.rename("work")).toBe("applies-next-connection");
    await vi.waitFor(() => expect(connectClient.connect).toHaveBeenCalledTimes(2));
    expect((await controller.getStatus()).status).toBe("connecting");
  });

  it.each([false, true])("连接时改名以能力声明确认结果，冲突=%s", async (conflict) => {
    systemConfig.setExternalAccessEnabled(true);
    const controller = await initEnrolled();
    await fake.established();
    const old = (await controller.getStatus()).name;
    const result = controller.rename("work");
    await vi.waitFor(() => expect(connectClient.connect).toHaveBeenCalledTimes(2));
    const hello = { jsonrpc: "2.0", method: "$session.hello", params: { daemonVersion: "1" } } as const;
    await fake.relayEnvelope(hello);
    expect(connectClient.send.mock.lastCall?.[0].params.peer.name).toBe("work");
    expect((await systemConfig.getExternalAccessIdentity()).name).toBe(old);
    if (conflict) {
      await fake.relayDisconnected("name-taken");
      await vi.waitFor(() => expect(connectClient.connect).toHaveBeenCalledTimes(3));
      await fake.relayEnvelope(hello);
      expect(connectClient.send.mock.lastCall?.[0].params.peer.name).toBe(old);
    }
    await fake.established();
    expect(await result).toBe(conflict ? "name-taken" : "ok");
    expect(await controller.getStatus()).toMatchObject({ status: "connected", name: conflict ? old : "work" });
    expect((await systemConfig.getExternalAccessIdentity()).name).toBe(conflict ? old : "work");
  });

  it("hello 只展示 daemon 版本，不按产品版本阻断兼容的 bridge 调用", async () => {
    systemConfig.setExternalAccessEnabled(true);
    const controller = await initEnrolled();
    await fake.relayEnvelope({
      jsonrpc: "2.0",
      method: "$session.hello",
      params: { daemonVersion: "0.1.0" },
    });
    // hello 携带 daemonVersion，状态条据此显示「sctl v{daemonVersion}」。
    await fake.established();
    expect(await controller.getStatus()).toEqual({
      status: "connected",
      daemonVersion: "0.1.0",
      name: (await systemConfig.getExternalAccessIdentity()).name,
    });

    await fake.relayEnvelope({
      jsonrpc: "2.0",
      method: "$session.hello",
      params: { daemonVersion: "0.0.1" },
    });
    await fake.established();
    expect(await controller.getStatus()).toEqual({
      status: "connected",
      daemonVersion: "0.0.1",
      name: (await systemConfig.getExternalAccessIdentity()).name,
    });
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
    systemConfig.setExternalAccessEnabled(true);
    const controller = await initEnrolled();
    await fake.relayEnvelope({
      jsonrpc: "2.0",
      method: "$session.hello",
      params: { daemonVersion: "0.1.0" },
    });
    await fake.established();
    await fake.relayDisconnected();
    expect(bridgeCancel).toHaveBeenCalledWith();
    // 重试期间之前 hello 报告的版本不应残留。
    expect(await controller.getStatus()).toEqual({
      status: "host_unreachable",
      daemonVersion: undefined,
      name: (await systemConfig.getExternalAccessIdentity()).name,
    });
  });

  it("stop() 发送 shutdown、断开并置为 disabled", async () => {
    const controller = await initEnrolled();
    controller.stop();
    expect(bridgeCancel).toHaveBeenCalledWith();
    expect(connectClient.send).toHaveBeenCalledWith(
      expect.objectContaining({ jsonrpc: "2.0", method: "$session.shutdown" })
    );
    expect(connectClient.disconnect).toHaveBeenCalled();
    expect((await controller.getStatus()).status).toBe("disabled");
  });
});
