import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initTestEnv } from "@Tests/utils";
import { MockMessage } from "@Packages/message/mock_message";
import { Server } from "@Packages/message/server";
import EventEmitter from "eventemitter3";
import type { WindowMessage } from "@Packages/message/window_message";
import type { ServiceWorkerClient } from "../service_worker/client";
import type { MessageSend, TMessage } from "@Packages/message/types";
import { BackgroundEnvManagerBase, SANDBOX_READY_FALLBACK_MS } from "./base";
import { MessageQueueGroup, type IMessageQueue } from "@Packages/message/message_queue";
import { SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_BACKGROUND, type ScriptRunResource } from "@App/app/repo/scripts";

initTestEnv();

const buildManager = () => {
  const bus = new MockMessage(new EventEmitter<string, any>());
  const offscreenServer = new Server("offscreen", bus);
  const preparationOffscreen = vi.fn();
  const serviceWorker = { preparationOffscreen } as unknown as ServiceWorkerClient;
  const manager = new BackgroundEnvManagerBase(
    {} as MessageSend,
    bus as unknown as WindowMessage,
    offscreenServer,
    serviceWorker
  );
  return { bus, offscreenServer, preparationOffscreen, manager };
};

class LocalMessageQueue implements IMessageQueue {
  private readonly events = new EventEmitter<string, any>();

  group(name: string, middleware?: Parameters<IMessageQueue["group"]>[1]) {
    return new MessageQueueGroup(this, name, middleware);
  }

  subscribe<T>(topic: string, handler: (message: T) => void) {
    this.events.on(topic, handler);
    return () => this.events.off(topic, handler);
  }

  publish<T>(topic: string, message: NonNullable<T>) {
    this.events.emit(topic, message);
  }

  emit<T>(topic: string, message: NonNullable<T>) {
    this.events.emit(topic, message);
  }
}

const flushAsyncHandlers = async () => {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
  }
};

// 单测重点：就绪信号完全由 sandbox 主动上报(preparationSandbox)，父层不 ping、不轮询、不猜测；
// sandbox 自行做的通道自检结果通过 reportSandboxChannelHealth 单独上报并记录到父层日志；
// 若 sandbox 从未上报任何消息，兜底超时仍会放行，且不会与真实握手产生重复通知
describe("BackgroundEnvManagerBase 就绪握手", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
    errorSpy.mockRestore();
    vi.useRealTimers();
  });

  it("sandbox 主动上报就绪后，立即通知 SW 就绪(不等待、不 ping)", () => {
    const { manager, preparationOffscreen } = buildManager();

    manager.preparationSandbox();

    expect(preparationOffscreen).toHaveBeenCalledTimes(1);
    expect(preparationOffscreen).toHaveBeenCalledWith({ verified: true });
  });

  it("sandbox 上报通道自检成功时，记录通过日志", () => {
    const { manager } = buildManager();

    manager.reportSandboxChannelHealth({ ok: true, roundTripMs: 12 });

    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining("communication verified"), expect.anything());
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("sandbox 上报通道自检失败时，记录失败日志(附带 sandbox 给出的具体原因)", () => {
    const { manager } = buildManager();

    manager.reportSandboxChannelHealth({ ok: false, error: "getExtensionEnv timed out after 5000ms" });

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("getExtensionEnv timed out"), expect.anything());
  });

  it("sandbox 从未上报就绪时，兜底超时后仍通知 SW 就绪，并记录明确的错误日志", () => {
    vi.useFakeTimers();
    const { manager, preparationOffscreen } = buildManager();

    // 直接触发兜底计时器的注册逻辑(initManager 本身依赖较重的服务构造，测试只关心兜底行为)
    (manager as unknown as { armReadyFallback(): void }).armReadyFallback();

    expect(preparationOffscreen).not.toHaveBeenCalled();

    vi.advanceTimersByTime(SANDBOX_READY_FALLBACK_MS);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("no sandbox readiness signal received"),
      expect.anything()
    );
    expect(preparationOffscreen).toHaveBeenCalledTimes(1);
    expect(preparationOffscreen).toHaveBeenCalledWith({ verified: false });
  });

  it("真实握手先到达时，兜底超时不会重复通知 SW 就绪", () => {
    vi.useFakeTimers();
    const { manager, preparationOffscreen } = buildManager();

    (manager as unknown as { armReadyFallback(): void }).armReadyFallback();
    manager.preparationSandbox();
    expect(preparationOffscreen).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(SANDBOX_READY_FALLBACK_MS);
    expect(preparationOffscreen).toHaveBeenCalledTimes(1);
  });

  it("兜底超时先触发后，迟到的真实握手会补发一次 verified 通知", () => {
    vi.useFakeTimers();
    const { manager, preparationOffscreen } = buildManager();

    (manager as unknown as { armReadyFallback(): void }).armReadyFallback();
    vi.advanceTimersByTime(SANDBOX_READY_FALLBACK_MS);
    expect(preparationOffscreen).toHaveBeenCalledTimes(1);
    expect(preparationOffscreen).toHaveBeenLastCalledWith({ verified: false });

    manager.preparationSandbox();
    expect(preparationOffscreen).toHaveBeenCalledTimes(2);
    expect(preparationOffscreen).toHaveBeenLastCalledWith({ verified: true });

    manager.preparationSandbox();
    expect(preparationOffscreen).toHaveBeenCalledTimes(2);
  });

  it("兜底初始化消息丢失后，迟到的真实握手会把后台脚本与语言各重放一次", async () => {
    vi.useFakeTimers();
    const bus = new MockMessage(new EventEmitter<string, any>());
    const offscreenServer = new Server("offscreen", bus);
    const messageQueue = new LocalMessageQueue();
    const backgroundScript = {
      uuid: "background-script",
      name: "background-script",
      type: SCRIPT_TYPE_BACKGROUND,
      status: SCRIPT_STATUS_ENABLE,
    } as ScriptRunResource;
    const extMsgSender = {
      connect: vi.fn(),
      sendMessage: vi.fn(async (message: TMessage) => {
        if (message.action === "serviceWorker/script/fetchInfo") {
          return { code: 0, data: backgroundScript };
        }
        if (message.action === "serviceWorker/script/getScriptRunResourceByUUID") {
          return { code: 0, data: backgroundScript };
        }
        return { code: 0 };
      }),
    } as unknown as MessageSend;
    let sandboxReady = false;
    const attemptedActions: string[] = [];
    const deliveredActions: string[] = [];
    const windowMessage = {
      connect: vi.fn(),
      sendMessage: vi.fn((message: TMessage) => {
        if (message.action) attemptedActions.push(message.action);
        if (!sandboxReady) return new Promise(() => {});
        if (message.action) deliveredActions.push(message.action);
        return Promise.resolve({ code: 0 });
      }),
    } as unknown as WindowMessage;
    const preparationOffscreen = vi.fn(() => {
      messageQueue.publish("enableScripts", [{ uuid: backgroundScript.uuid, enable: true }]);
      messageQueue.publish("setSandboxLanguage", "zh-CN");
    });
    const manager = new BackgroundEnvManagerBase(
      extMsgSender,
      windowMessage,
      offscreenServer,
      { preparationOffscreen } as unknown as ServiceWorkerClient,
      messageQueue
    );
    await manager.initManager();

    vi.advanceTimersByTime(SANDBOX_READY_FALLBACK_MS);
    await flushAsyncHandlers();

    expect(attemptedActions).toEqual(expect.arrayContaining(["sandbox/enableScript", "sandbox/setSandboxLanguage"]));
    expect(deliveredActions).toEqual([]);

    sandboxReady = true;
    manager.preparationSandbox();
    await flushAsyncHandlers();

    expect(deliveredActions.filter((action) => action === "sandbox/enableScript")).toHaveLength(1);
    expect(deliveredActions.filter((action) => action === "sandbox/setSandboxLanguage")).toHaveLength(1);

    manager.preparationSandbox();
    await flushAsyncHandlers();
    expect(deliveredActions.filter((action) => action === "sandbox/enableScript")).toHaveLength(1);
    expect(deliveredActions.filter((action) => action === "sandbox/setSandboxLanguage")).toHaveLength(1);
  });
});
