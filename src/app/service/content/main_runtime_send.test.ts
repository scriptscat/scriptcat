import { describe, expect, it, vi } from "vitest";
import { MainRuntimeSend } from "./main_runtime_send";

const message = (action: string) => ({ action, data: { value: 1 } });

describe("MainRuntimeSend", () => {
  it("starts unselected and rejects sends until SW selects a mode", async () => {
    const native = { sendMessage: vi.fn(), connect: vi.fn() };
    const page = { sendMessage: vi.fn(), connect: vi.fn() };
    const transport = new MainRuntimeSend(native, page);

    await expect(transport.sendMessage(message("serviceWorker/runtime/gmApi"))).rejects.toThrow("not selected");
    expect(native.sendMessage).not.toHaveBeenCalled();
    expect(page.sendMessage).not.toHaveBeenCalled();
  });

  it("sends every native action through the service worker adapter", async () => {
    const native = { sendMessage: vi.fn().mockResolvedValue("ok"), connect: vi.fn() };
    const page = { sendMessage: vi.fn(), connect: vi.fn() };
    const transport = new MainRuntimeSend(native, page);
    transport.selectNative();

    await transport.sendMessage(message("serviceWorker/runtime/gmApi"));
    expect(native.sendMessage).toHaveBeenCalledWith(message("serviceWorker/runtime/gmApi"));
  });

  it("rewrites only MAIN GM RPC in fallback mode", async () => {
    const native = { sendMessage: vi.fn(), connect: vi.fn() };
    const page = { sendMessage: vi.fn().mockResolvedValue("ok"), connect: vi.fn() };
    const transport = new MainRuntimeSend(native, page);
    transport.selectFallback();

    await transport.sendMessage(message("serviceWorker/runtime/gmApi"));
    expect(page.sendMessage).toHaveBeenCalledWith(message("scripting/runtime/gmApi"));
    await expect(transport.sendMessage(message("serviceWorker/runtime/valueUpdate"))).rejects.toThrow(
      "does not support"
    );
  });

  it("keeps a selected transport idempotent and rejects reversal", () => {
    const native = { sendMessage: vi.fn(), connect: vi.fn() };
    const page = { sendMessage: vi.fn(), connect: vi.fn() };

    const nativeTransport = new MainRuntimeSend(native, page);
    nativeTransport.selectNative();
    expect(() => nativeTransport.selectNative()).not.toThrow();
    expect(() => nativeTransport.selectFallback()).toThrow("cannot change");

    const fallbackTransport = new MainRuntimeSend(native, page);
    fallbackTransport.selectFallback();
    expect(() => fallbackTransport.selectFallback()).not.toThrow();
    expect(() => fallbackTransport.selectNative()).toThrow("cannot change");
  });

});
