import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const { get, set, subscribe, subscription } = vi.hoisted(() => {
  const subscription: { handler?: (message: { key: string }) => void } = {};
  return {
    get: vi.fn(() => Promise.resolve("scriptcat")),
    set: vi.fn(),
    subscribe: vi.fn((_topic: string, handler: (message: { key: string }) => void) => {
      subscription.handler = handler;
      return () => delete subscription.handler;
    }),
    subscription,
  };
});
vi.mock("@App/pages/store/global", () => ({
  systemConfig: { get, set },
  subscribeMessage: subscribe,
}));

import { useSystemConfig } from "./useSystemConfig";

beforeEach(() => {
  vi.clearAllMocks();
  delete subscription.handler;
});

describe("配置 Hook useSystemConfig", () => {
  it("挂载时读取配置值", async () => {
    const { result } = renderHook(() => useSystemConfig("favicon_service"));
    await waitFor(() => expect(result.current[0]).toBe("scriptcat"));
    expect(get).toHaveBeenCalledWith("favicon_service");
  });

  it("调用 setter 即时写入 systemConfig 并更新本地值", async () => {
    const { result } = renderHook(() => useSystemConfig("favicon_service"));
    await waitFor(() => expect(result.current[0]).toBe("scriptcat"));
    act(() => result.current[1]("google" as never));
    expect(set).toHaveBeenCalledWith("favicon_service", "google");
    expect(result.current[0]).toBe("google");
  });

  it("getter 返回同步值时 hook 依然能正确填充", async () => {
    get.mockReturnValueOnce("declare const x: any;" as never);
    const { result } = renderHook(() => useSystemConfig("editor_type_definition" as never));
    await waitFor(() => expect(result.current[0]).toBe("declare const x: any;"));
  });

  it("收到配置变更通知时重新读取最新快照", async () => {
    const { result } = renderHook(() => useSystemConfig("favicon_service"));
    await waitFor(() => expect(result.current[0]).toBe("scriptcat"));
    get.mockResolvedValueOnce("google" as never);

    act(() => subscription.handler?.({ key: "favicon_service" }));

    await waitFor(() => expect(result.current[0]).toBe("google"));
  });

  it("初始读取延迟返回时不覆盖用户的新设置", async () => {
    let resolveGet!: (value: string) => void;
    get.mockReturnValueOnce(new Promise<string>((resolve) => (resolveGet = resolve)) as never);
    const { result } = renderHook(() => useSystemConfig("favicon_service"));

    act(() => result.current[1]("google" as never));
    resolveGet("scriptcat");

    await waitFor(() => expect(result.current[0]).toBe("google"));
  });
});
