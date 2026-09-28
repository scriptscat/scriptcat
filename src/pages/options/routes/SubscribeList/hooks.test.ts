import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Subscribe } from "@App/app/repo/subscribe";
import { SubscribeStatusType } from "@App/app/repo/subscribe";
import type { TInstallSubscribe } from "@App/app/service/queue";

const { messageHandlers, fetchSubscribeList } = vi.hoisted(() => ({
  messageHandlers: new Map<string, (data: object) => void>(),
  fetchSubscribeList: vi.fn(),
}));

vi.mock("@App/pages/store/global", async () => {
  const { createGlobalStoreMock } = await import("@Tests/mocks/pageStores.ts");
  return {
    ...createGlobalStoreMock(),
    subscribeMessage: vi.fn((topic: string, handler: (data: object) => void) => {
      messageHandlers.set(topic, handler);
      return () => messageHandlers.delete(topic);
    }),
  };
});

vi.mock("@App/pages/store/features/subscribe", () => ({ fetchSubscribeList }));

import { useSubscribeDataManagement } from "./hooks";

const mk = (url: string, overrides: Partial<Subscribe> = {}): Subscribe => ({
  url,
  name: url,
  code: "",
  author: "",
  scripts: {},
  metadata: { usersubscribe: [], version: ["0.1.0"] },
  status: SubscribeStatusType.enable,
  createtime: 1,
  updatetime: 1,
  checktime: 1,
  ...overrides,
});

const A = "https://example.com/a.user.sub.js";
const B = "https://example.com/b.user.sub.js";
const C = "https://example.com/c.user.sub.js";

const publish = (subscribe: Subscribe) =>
  act(() => messageHandlers.get("upsertSubscribe")?.({ subscribe } satisfies TInstallSubscribe));

beforeEach(() => {
  messageHandlers.clear();
  fetchSubscribeList.mockResolvedValue([mk(A)]);
});

// 列表只在挂载时拉取一次；后台静默更新或在安装页装好订阅后，列表要跟随广播刷新
describe("订阅列表数据随后台广播同步", () => {
  it("已有订阅更新后就地替换该行", async () => {
    const { result } = renderHook(() => useSubscribeDataManagement());
    await waitFor(() => expect(result.current.loadingList).toBe(false));

    publish(
      mk(A, {
        metadata: { usersubscribe: [], version: ["0.2.0"] },
        scripts: { "https://example.com/x.user.js": { url: "https://example.com/x.user.js", uuid: "x" } },
        updatetime: 2,
      })
    );

    expect(result.current.subscribeList).toHaveLength(1);
    expect(result.current.subscribeList[0].metadata.version).toEqual(["0.2.0"]);
    expect(Object.keys(result.current.subscribeList[0].scripts)).toEqual(["https://example.com/x.user.js"]);
  });

  it("新安装的订阅按创建时间追加", async () => {
    const { result } = renderHook(() => useSubscribeDataManagement());
    await waitFor(() => expect(result.current.loadingList).toBe(false));

    publish(mk(B, { createtime: 2 }));

    expect(result.current.subscribeList.map((s) => s.url)).toEqual([A, B]);
  });

  it("初始列表读取期间的后台广播不会被过期快照覆盖", async () => {
    let resolveList!: (list: Subscribe[]) => void;
    const pendingList = new Promise<Subscribe[]>((resolve) => {
      resolveList = resolve;
    });
    fetchSubscribeList.mockReturnValueOnce(pendingList);
    const { result } = renderHook(() => useSubscribeDataManagement());

    publish(
      mk(A, {
        metadata: { usersubscribe: [], version: ["0.2.0"] },
        scripts: { "https://example.com/x.user.js": { url: "https://example.com/x.user.js", uuid: "x" } },
        updatetime: 2,
        checktime: 2,
        createtime: 99,
      })
    );
    publish(mk(B, { createtime: 2 }));

    await act(async () => {
      resolveList([
        Object.assign(
          mk(A, {
            metadata: { usersubscribe: [], version: ["0.1.0"] },
            status: SubscribeStatusType.disable,
            updatetime: 1,
            checktime: 4,
            createtime: 7,
          }),
          { actionLoading: true }
        ),
        mk(C, { createtime: 3 }),
      ]);
      await pendingList;
    });

    expect(result.current.subscribeList.map((subscribe) => subscribe.url)).toEqual([B, C, A]);
    expect(result.current.subscribeList.find((subscribe) => subscribe.url === A)).toMatchObject({
      metadata: { version: ["0.2.0"] },
      status: SubscribeStatusType.disable,
      checktime: 4,
      createtime: 7,
      actionLoading: true,
    });
    expect(result.current.loadingList).toBe(false);
  });

  it("初始读取期间按订阅更新时间保留最新广播", async () => {
    let resolveList!: (list: Subscribe[]) => void;
    const pendingList = new Promise<Subscribe[]>((resolve) => {
      resolveList = resolve;
    });
    fetchSubscribeList.mockReturnValueOnce(pendingList);
    const { result } = renderHook(() => useSubscribeDataManagement());

    publish(
      mk(A, {
        metadata: { usersubscribe: [], version: ["0.3.0"] },
        updatetime: 20,
        createtime: 99,
      })
    );
    publish(
      mk(A, {
        metadata: { usersubscribe: [], version: ["0.2.0"] },
        updatetime: 10,
        createtime: 99,
      })
    );

    await act(async () => {
      resolveList([
        Object.assign(
          mk(A, {
            status: SubscribeStatusType.disable,
            updatetime: 5,
            checktime: 4,
            createtime: 7,
          }),
          { actionLoading: true }
        ),
      ]);
      await pendingList;
    });

    expect(result.current.subscribeList[0]).toMatchObject({
      metadata: { version: ["0.3.0"] },
      updatetime: 20,
      status: SubscribeStatusType.disable,
      checktime: 4,
      createtime: 7,
      actionLoading: true,
    });
  });

  it("列表加载后忽略较旧广播且保留当前操作状态", async () => {
    const { result } = renderHook(() => useSubscribeDataManagement());
    await waitFor(() => expect(result.current.loadingList).toBe(false));
    act(() => {
      result.current.setSubscribeList((list) =>
        list.map((subscribe) => ({
          ...subscribe,
          status: SubscribeStatusType.disable,
          checktime: 4,
          actionLoading: true,
        }))
      );
    });

    publish(
      mk(A, {
        metadata: { usersubscribe: [], version: ["0.3.0"] },
        updatetime: 20,
        createtime: 99,
        checktime: 8,
      })
    );
    publish(
      mk(A, {
        metadata: { usersubscribe: [], version: ["0.2.0"] },
        updatetime: 10,
        createtime: 99,
        checktime: 8,
      })
    );

    expect(result.current.subscribeList[0]).toMatchObject({
      metadata: { version: ["0.3.0"] },
      updatetime: 20,
      status: SubscribeStatusType.disable,
      checktime: 4,
      createtime: 1,
      actionLoading: true,
    });
  });

  it("卸载后取消订阅广播", async () => {
    const { result, unmount } = renderHook(() => useSubscribeDataManagement());
    await waitFor(() => expect(result.current.loadingList).toBe(false));

    unmount();

    expect(messageHandlers.has("upsertSubscribe")).toBe(false);
  });
});
