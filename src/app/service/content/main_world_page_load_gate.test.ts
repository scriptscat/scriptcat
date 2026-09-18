import { describe, expect, it, vi } from "vitest";
import { createMainWorldPageLoadGate } from "./main_world_page_load_gate";

describe("createMainWorldPageLoadGate", () => {
  it("does not deliver the page-visible payload while the native channel is opening", async () => {
    let resolveNative!: (connected: boolean) => void;
    const openNativeChannel = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveNative = resolve;
        })
    );
    const receivePageLoad = vi.fn();
    const gate = createMainWorldPageLoadGate(openNativeChannel, receivePageLoad);

    gate.onPageLoad({ source: "page" });
    gate.onBootstrap("bootstrap-token");

    expect(openNativeChannel).toHaveBeenCalledWith("bootstrap-token");
    expect(receivePageLoad).not.toHaveBeenCalled();

    resolveNative(true);
    await Promise.resolve();
    expect(receivePageLoad).not.toHaveBeenCalled();

    gate.onPageLoad({ source: "replay" });
    expect(receivePageLoad).not.toHaveBeenCalled();
  });

  it("releases one queued payload only when native transport is unavailable", async () => {
    const receivePageLoad = vi.fn();
    const requestFallbackPageLoad = vi.fn();
    const gate = createMainWorldPageLoadGate(async () => false, receivePageLoad, requestFallbackPageLoad);
    const first = { source: "page" };
    const second = { source: "page-after-fallback" };

    gate.onPageLoad(first);
    gate.onBootstrap("bootstrap-token");
    await Promise.resolve();

    expect(receivePageLoad).toHaveBeenCalledWith(first);
    expect(requestFallbackPageLoad).toHaveBeenCalledOnce();

    gate.onPageLoad(second);
    expect(receivePageLoad).toHaveBeenLastCalledWith(second);
    expect(receivePageLoad).toHaveBeenCalledTimes(2);
  });

  it("does not request a page-visible fallback after native transport succeeds", async () => {
    const requestFallbackPageLoad = vi.fn();
    const gate = createMainWorldPageLoadGate(async () => true, vi.fn(), requestFallbackPageLoad);

    gate.onBootstrap("bootstrap-token");
    await Promise.resolve();

    expect(requestFallbackPageLoad).not.toHaveBeenCalled();
  });

  it("does not reopen or fall back after the native channel has been selected", async () => {
    const receivePageLoad = vi.fn();
    const openNativeChannel = vi.fn(async () => true);
    const gate = createMainWorldPageLoadGate(openNativeChannel, receivePageLoad);

    gate.onBootstrap("first-token");
    await Promise.resolve();
    gate.onBootstrap("second-token");
    gate.onPageLoad({ source: "replay" });

    expect(openNativeChannel).toHaveBeenCalledOnce();
    expect(receivePageLoad).not.toHaveBeenCalled();
  });
});
