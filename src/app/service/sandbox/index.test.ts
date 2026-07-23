import { describe, it, expect, vi, afterEach } from "vitest";
import { initTestEnv } from "@Tests/utils";
import { MockMessage } from "@Packages/message/mock_message";
import { Server } from "@Packages/message/server";
import EventEmitter from "eventemitter3";
import type { WindowMessage } from "@Packages/message/window_message";
import { SandboxManager } from "./index";

initTestEnv();

// 单测重点：sandbox 主动、立即上报就绪(不等待任何往返请求)，并在此后非阻塞地对自己发起的
// getExtensionEnv 请求做一次连通性自检，把结果(成功/超时)上报给父层记录 —— 父层不会、也不需要
// 反过来 ping sandbox，因为只有 sandbox 自己知道它什么时候真正就绪
describe("SandboxManager 就绪与通道自检上报", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("初始化时立即上报就绪，不等待 getExtensionEnv 完成", () => {
    const bus = new MockMessage(new EventEmitter<string, any>());
    const offscreenServer = new Server("offscreen", bus);
    const preparationSandbox = vi.fn();
    offscreenServer.on("preparationSandbox", preparationSandbox);
    // 故意不注册 getExtensionEnv 处理器：模拟该请求一直挂起，不应阻塞就绪上报
    offscreenServer.on("reportSandboxChannelHealth", vi.fn());

    const manager = new SandboxManager(bus as unknown as WindowMessage);
    manager.initManager();

    expect(preparationSandbox).toHaveBeenCalledTimes(1);
  });

  it("getExtensionEnv 及时响应时，上报通道自检成功", async () => {
    const bus = new MockMessage(new EventEmitter<string, any>());
    const offscreenServer = new Server("offscreen", bus);
    offscreenServer.on("preparationSandbox", vi.fn());
    offscreenServer.on("getExtensionEnv", () => ({ inIncognitoContext: false }));
    const reportHealth = vi.fn();
    offscreenServer.on("reportSandboxChannelHealth", reportHealth);

    const manager = new SandboxManager(bus as unknown as WindowMessage);
    manager.initManager();

    // 让 getExtensionEnv 的响应和后续的 .then() 链有机会跑完(多层 Promise.race/finally/then)
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(reportHealth).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, roundTripMs: expect.any(Number) }),
      expect.anything()
    );
  });

  it("getExtensionEnv 超时未响应时，上报通道自检失败(附带具体原因)", async () => {
    vi.useFakeTimers();
    const bus = new MockMessage(new EventEmitter<string, any>());
    const offscreenServer = new Server("offscreen", bus);
    offscreenServer.on("preparationSandbox", vi.fn());
    // 注册一个永不 resolve 的处理器，模拟父层收到请求但从未响应(通道单向不可用)，
    // 而不是不注册该 action —— 后者会被 Server 当作"没有这个 API"立即报错，无法模拟真正的挂起
    offscreenServer.on("getExtensionEnv", () => new Promise(() => {}));
    const reportHealth = vi.fn();
    offscreenServer.on("reportSandboxChannelHealth", reportHealth);

    const manager = new SandboxManager(bus as unknown as WindowMessage);
    manager.initManager();

    await vi.advanceTimersByTimeAsync(5000);

    expect(reportHealth).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, error: expect.stringContaining("timed out") }),
      expect.anything()
    );
  });
});
