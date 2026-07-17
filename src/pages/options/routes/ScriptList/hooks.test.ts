import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// useTrashCount 存在的唯一意义：只订阅真正会改变回收站内容的事件（trashScripts/deleteScripts/
// installScript），不能挂在 enableScripts/sortedScripts 上——那两个只是启用状态或拖拽顺序变化，
// 回收站条目数并未改变，挂上去会导致每次拖动/切换启用都重拉一次回收站。
const { requestTrashScripts } = vi.hoisted(() => ({
  requestTrashScripts: vi.fn(() => Promise.resolve<{ uuid: string }[]>([])),
}));

const { subscribeMessage, unsubscribeByTopic } = vi.hoisted(() => {
  const unsubscribeByTopic = new Map<string, ReturnType<typeof vi.fn>>();
  const subscribeMessage = vi.fn((topic: string, _handler: (msg: unknown) => void) => {
    const unsub = vi.fn();
    unsubscribeByTopic.set(topic, unsub);
    return unsub;
  });
  return { subscribeMessage, unsubscribeByTopic };
});

vi.mock("@App/pages/store/features/script", () => ({
  fetchScript: vi.fn(),
  fetchScriptList: vi.fn(),
  requestTrashScripts,
}));

vi.mock("@App/pages/store/favicons", () => ({
  loadScriptFavicons: vi.fn(),
}));

vi.mock("@App/app/cache", () => ({
  cacheInstance: { tx: vi.fn() },
}));

vi.mock("@App/pages/store/global", () => ({
  systemConfig: { getFaviconService: vi.fn() },
  subscribeMessage,
}));

import { useTrashCount } from "./hooks";

// 捕获 subscribeMessage 各 topic 对应的 handler，供测试手动触发。
function getHandler(topic: string): (msg: unknown) => void {
  const call = subscribeMessage.mock.calls.find(([t]) => t === topic);
  if (!call) throw new Error(`未找到 topic 为 "${topic}" 的订阅`);
  return call[1] as (msg: unknown) => void;
}

beforeEach(() => {
  vi.clearAllMocks();
  unsubscribeByTopic.clear();
});

describe("回收站计数 Hook useTrashCount", () => {
  it("挂载时拉取一次回收站计数，并反映条数", async () => {
    requestTrashScripts.mockResolvedValueOnce([{ uuid: "a" }, { uuid: "b" }]);

    const { result } = renderHook(() => useTrashCount());

    await waitFor(() => expect(result.current[0]).toBe(2));
    expect(requestTrashScripts).toHaveBeenCalledTimes(1);
  });

  it("trashScripts / deleteScripts / installScript 各自触发都会重新拉取", async () => {
    renderHook(() => useTrashCount());
    await waitFor(() => expect(requestTrashScripts).toHaveBeenCalledTimes(1));

    act(() => getHandler("trashScripts")({}));
    await waitFor(() => expect(requestTrashScripts).toHaveBeenCalledTimes(2));

    act(() => getHandler("deleteScripts")({}));
    await waitFor(() => expect(requestTrashScripts).toHaveBeenCalledTimes(3));

    act(() => getHandler("installScript")({}));
    await waitFor(() => expect(requestTrashScripts).toHaveBeenCalledTimes(4));
  });

  it("防回归：不订阅 sortedScripts / enableScripts，拖拽排序与启用禁用不会重拉回收站", async () => {
    renderHook(() => useTrashCount());
    await waitFor(() => expect(requestTrashScripts).toHaveBeenCalledTimes(1));

    const subscribedTopics = subscribeMessage.mock.calls.map(([topic]) => topic);
    expect(subscribedTopics).toEqual(expect.arrayContaining(["trashScripts", "deleteScripts", "installScript"]));
    expect(subscribedTopics).not.toContain("sortedScripts");
    expect(subscribedTopics).not.toContain("enableScripts");
  });

  it("卸载时取消全部订阅，不泄漏", async () => {
    const { unmount } = renderHook(() => useTrashCount());
    await waitFor(() => expect(requestTrashScripts).toHaveBeenCalledTimes(1));

    const unhooks = ["trashScripts", "deleteScripts", "installScript"].map((topic) => unsubscribeByTopic.get(topic)!);
    unhooks.forEach((unhook) => expect(unhook).not.toHaveBeenCalled());

    unmount();

    unhooks.forEach((unhook) => expect(unhook).toHaveBeenCalledTimes(1));
  });
});
