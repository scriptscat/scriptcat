import { describe, expect, it, vi } from "vitest";
import { createMainWorldPageLoadGate } from "./main_world_page_load_gate";

describe("createMainWorldPageLoadGate", () => {
  it("ignores page-visible fallbacks while native opens and requests one only after failure", async () => {
    let finishNative!: (connected: boolean) => void;
    const openNativeChannel = vi.fn(() => new Promise<boolean>((resolve) => (finishNative = resolve)));
    const requestFallbackPageLoad = vi.fn();
    const receiveFallbackPageLoad = vi.fn();
    const gate = createMainWorldPageLoadGate(openNativeChannel, requestFallbackPageLoad, receiveFallbackPageLoad);

    gate.onBootstrap("bootstrap-token");
    expect(requestFallbackPageLoad).not.toHaveBeenCalled();
    gate.onFallbackPageLoad({ source: "forged" });
    expect(receiveFallbackPageLoad).not.toHaveBeenCalled();
    gate.onBootstrap("replay-token");
    finishNative(false);
    await Promise.resolve();
    expect(requestFallbackPageLoad).toHaveBeenCalledOnce();
    const fallback = { source: "restricted-fallback" };
    gate.onFallbackPageLoad(fallback);
    gate.onFallbackPageLoad({ source: "replay" });

    expect(openNativeChannel).toHaveBeenCalledOnce();
    expect(openNativeChannel).toHaveBeenCalledWith("bootstrap-token");
    expect(requestFallbackPageLoad).toHaveBeenCalledOnce();
    expect(receiveFallbackPageLoad).toHaveBeenCalledOnce();
    expect(receiveFallbackPageLoad).toHaveBeenCalledWith(fallback);
    expect(gate).not.toHaveProperty("onPageLoad");
  });

  it("ignores page-visible fallbacks while native bootstrap succeeds", async () => {
    const requestFallbackPageLoad = vi.fn();
    const receiveFallbackPageLoad = vi.fn();
    let finishNative!: (connected: boolean) => void;
    const gate = createMainWorldPageLoadGate(
      () => new Promise<boolean>((resolve) => (finishNative = resolve)),
      requestFallbackPageLoad,
      receiveFallbackPageLoad
    );

    gate.onBootstrap("bootstrap-token");
    gate.onFallbackPageLoad({ source: "forged-while-opening" });
    expect(receiveFallbackPageLoad).not.toHaveBeenCalled();
    finishNative(true);
    await Promise.resolve();
    gate.onFallbackPageLoad({ source: "forged" });

    expect(requestFallbackPageLoad).not.toHaveBeenCalled();
    expect(receiveFallbackPageLoad).not.toHaveBeenCalled();
  });

  it("requests the restricted fallback when native bootstrap rejects", async () => {
    const requestFallbackPageLoad = vi.fn();
    let rejectConnection!: (reason: Error) => void;
    const openNativeChannel = vi.fn(
      () =>
        new Promise<boolean>((_resolve, reject) => {
          rejectConnection = reject;
        })
    );
    const receiveFallbackPageLoad = vi.fn();
    const gate = createMainWorldPageLoadGate(openNativeChannel, requestFallbackPageLoad, receiveFallbackPageLoad);

    gate.onBootstrap("bootstrap-token");
    gate.onFallbackPageLoad({ source: "forged-while-opening" });
    rejectConnection(new Error("connection failed"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(requestFallbackPageLoad).toHaveBeenCalledOnce();
    gate.onFallbackPageLoad({ source: "fallback" });
    expect(receiveFallbackPageLoad).toHaveBeenCalledOnce();
  });
});
