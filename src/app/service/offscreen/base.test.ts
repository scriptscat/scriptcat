import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initTestEnv } from "@Tests/utils";
import { MockMessage } from "@Packages/message/mock_message";
import { Server } from "@Packages/message/server";
import EventEmitter from "eventemitter3";
import type { WindowMessage } from "@Packages/message/window_message";
import type { ServiceWorkerClient } from "../service_worker/client";
import type { MessageSend } from "@Packages/message/types";
import { BackgroundEnvManagerBase, SANDBOX_READY_FALLBACK_MS } from "./base";

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

  it("兜底超时先触发后，迟到的真实握手不会重复通知 SW 就绪", () => {
    vi.useFakeTimers();
    const { manager, preparationOffscreen } = buildManager();

    (manager as unknown as { armReadyFallback(): void }).armReadyFallback();
    vi.advanceTimersByTime(SANDBOX_READY_FALLBACK_MS);
    expect(preparationOffscreen).toHaveBeenCalledTimes(1);

    manager.preparationSandbox();
    expect(preparationOffscreen).toHaveBeenCalledTimes(1);
  });
});
