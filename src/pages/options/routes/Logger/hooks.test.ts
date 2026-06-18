// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// useLogger 通过消息总线读取日志、读写清理周期；测试中整体打桩，只验证自动刷新的定时行为。
const { fetchLogs, requestClearLogs, requestDeleteLogs, getLogCleanCycle, setLogCleanCycle } = vi.hoisted(() => ({
  fetchLogs: vi.fn(() => Promise.resolve([])),
  requestClearLogs: vi.fn(() => Promise.resolve()),
  requestDeleteLogs: vi.fn(() => Promise.resolve()),
  getLogCleanCycle: vi.fn(() => Promise.resolve(7)),
  setLogCleanCycle: vi.fn(),
}));

vi.mock("@App/pages/store/features/log", () => ({ fetchLogs, requestClearLogs, requestDeleteLogs }));
vi.mock("@App/pages/store/global", () => ({ systemConfig: { getLogCleanCycle, setLogCleanCycle } }));

import { useLogger } from "./hooks";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("日志数据 Hook useLogger 自动刷新", () => {
  it("挂载时按当前范围拉取一次日志", async () => {
    renderHook(() => useLogger(), { wrapper: MemoryRouter });
    await act(async () => {});
    expect(fetchLogs).toHaveBeenCalledTimes(1);
  });

  it("开启自动刷新后每个间隔重新拉取，关闭后停止", async () => {
    const { result } = renderHook(() => useLogger(), { wrapper: MemoryRouter });
    await act(async () => {});
    expect(fetchLogs).toHaveBeenCalledTimes(1);

    act(() => result.current.setRefreshInterval("5s"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(fetchLogs).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(fetchLogs).toHaveBeenCalledTimes(3);

    act(() => result.current.setRefreshInterval("off"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(fetchLogs).toHaveBeenCalledTimes(3);
  });
});
