import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const { get, set, subscribe } = vi.hoisted(() => ({
  get: vi.fn(() => Promise.resolve("scriptcat")),
  set: vi.fn(),
  subscribe: vi.fn(() => () => {}),
}));
vi.mock("@App/pages/store/global", () => ({
  systemConfig: { get, set },
  subscribeMessage: subscribe,
}));

import { useSystemConfig } from "./useSystemConfig";

beforeEach(() => vi.clearAllMocks());

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
});
