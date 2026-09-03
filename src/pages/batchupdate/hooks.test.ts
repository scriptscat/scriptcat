import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { t } from "@App/locales/locales";
import { initTestLanguage } from "@Tests/initTestLanguage";
import type {
  TBatchUpdateRecord,
  TBatchUpdateRecordObject,
  TBatchUpdateResult,
} from "@App/app/service/service_worker/types";
import type * as Utils from "@App/pkg/utils/utils";

// useBatchUpdate 通过消息总线订阅检查状态、拉取记录并发起动作；这里整体打桩，
// 只验证「用户主动点检查更新 → 完成后弹 toast」的反馈逻辑。
const h = vi.hoisted(() => ({
  record: { checktime: 0, list: [] } as TBatchUpdateRecordObject,
  handlers: {} as Record<string, (msg: unknown) => void>,
  getBatchUpdateRecordLite: vi.fn(),
  fetchCheckUpdateStatus: vi.fn(() => Promise.resolve()),
  sendUpdatePageOpened: vi.fn(() => Promise.resolve()),
  requestCheckScriptUpdate: vi.fn(() => Promise.resolve()),
  requestBatchUpdateListAction: vi.fn((): Promise<TBatchUpdateResult | undefined> => Promise.resolve(undefined)),
  requestOpenUpdatePageByUUID: vi.fn(() => Promise.resolve()),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  openInCurrentTab: vi.fn(() => Promise.resolve()),
}));

h.getBatchUpdateRecordLite.mockImplementation((i: number) =>
  Promise.resolve({ chunk: i === 0 ? JSON.stringify(h.record) : "", ended: true })
);

vi.mock("@App/pages/store/features/script", () => ({
  scriptClient: {
    getBatchUpdateRecordLite: h.getBatchUpdateRecordLite,
    fetchCheckUpdateStatus: h.fetchCheckUpdateStatus,
    sendUpdatePageOpened: h.sendUpdatePageOpened,
  },
  requestCheckScriptUpdate: h.requestCheckScriptUpdate,
  requestBatchUpdateListAction: h.requestBatchUpdateListAction,
  requestOpenUpdatePageByUUID: h.requestOpenUpdatePageByUUID,
}));

vi.mock("@App/pages/store/global", () => ({
  subscribeMessage: (name: string, cb: (msg: unknown) => void) => {
    h.handlers[name] = cb;
    return () => delete h.handlers[name];
  },
}));

vi.mock("@App/pages/components/ui/toast", () => ({
  notify: {
    success: h.toastSuccess,
    error: vi.fn(),
    info: vi.fn(),
    warning: h.toastWarning,
    loading: vi.fn(),
    promise: vi.fn(),
    undo: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock("@App/pkg/utils/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof Utils>()),
  openInCurrentTab: h.openInCurrentTab,
}));

import { useBatchUpdate } from "./hooks";

function mkRecord(uuid: string, newVersion = "1.1.0", sites: string[] = []): TBatchUpdateRecord {
  return {
    uuid,
    checkUpdate: true,
    oldCode: "",
    newCode: "",
    codeSimilarity: 0.9,
    newMeta: { version: [newVersion], connect: [] },
    script: {
      uuid,
      name: "脚本",
      status: 1,
      metadata: { version: ["1.0.0"], connect: [] },
      downloadUrl: "https://example.com/s.user.js",
    },
    sites,
    withNewConnect: false,
  } as unknown as TBatchUpdateRecord;
}

/** 发起一次检查：emit 检查中状态 → 设置新记录 → emit 完成状态 */
async function runCheck(records: TBatchUpdateRecord[]) {
  act(() => h.handlers.onScriptUpdateCheck({ status: 1 }));
  h.record = { checktime: 200, list: records };
  await act(async () => {
    h.handlers.onScriptUpdateCheck({ status: 0, checktime: 200 });
  });
}

beforeAll(() => initTestLanguage("zh-CN"));

beforeEach(() => {
  h.record = { checktime: 0, list: [] };
  h.handlers = {};
  vi.clearAllMocks();
});

describe("批量更新 Hook useBatchUpdate 检查完成反馈", () => {
  it("用户主动检查后有更新时弹出包含数量的 toast", async () => {
    const { result } = renderHook(() => useBatchUpdate());
    await act(async () => {});

    act(() => result.current.onCheckNow());
    expect(h.requestCheckScriptUpdate).toHaveBeenCalledWith({ checkType: "user" });

    await runCheck([mkRecord("a")]);

    expect(h.toastSuccess).toHaveBeenCalledTimes(1);
    expect(h.toastSuccess.mock.calls[0][0]).toContain("1");
    expect(h.toastSuccess.mock.calls[0][0]).toBe(t("install:updatepage.toast_found", { count: 1 }));
  });

  it("用户主动检查后无更新时弹出「均为最新」toast", async () => {
    const { result } = renderHook(() => useBatchUpdate());
    await act(async () => {});

    act(() => result.current.onCheckNow());
    await runCheck([]);

    expect(h.toastSuccess).toHaveBeenCalledTimes(1);
    expect(h.toastSuccess.mock.calls[0][0]).toBe(t("install:updatepage.toast_uptodate"));
  });

  it("非用户发起的后台检查完成时不弹 toast", async () => {
    renderHook(() => useBatchUpdate());
    await act(async () => {});

    await runCheck([mkRecord("a")]);
    expect(h.toastSuccess).not.toHaveBeenCalled();
  });
});

describe("批量更新 Hook useBatchUpdate 站点优先级(?site=)", () => {
  it("URL 带 site 时把命中该站点的更新排到列表最前", async () => {
    window.history.replaceState({}, "", "/?site=example.com");

    const { result } = renderHook(() => useBatchUpdate());
    await act(async () => {});

    await runCheck([
      mkRecord("a", "1.1.0", ["other.com"]),
      mkRecord("b", "1.1.0", ["example.com"]),
      mkRecord("c", "1.1.0", []),
    ]);

    await waitFor(() => expect(result.current.updates).toHaveLength(3));
    expect(result.current.updates.map((u) => u.uuid)).toEqual(["b", "a", "c"]);
    expect(result.current.updates.find((u) => u.uuid === "b")?.siteMatch).toBe(true);
    expect(result.current.updates.find((u) => u.uuid === "a")?.siteMatch).toBe(false);

    window.history.replaceState({}, "", "/");
  });

  it("URL 无 site 时保持记录原有顺序且均不标记 siteMatch", async () => {
    window.history.replaceState({}, "", "/");

    const { result } = renderHook(() => useBatchUpdate());
    await act(async () => {});

    await runCheck([mkRecord("a", "1.1.0", ["x.com"]), mkRecord("b", "1.1.0", ["y.com"])]);

    await waitFor(() => expect(result.current.updates).toHaveLength(2));
    expect(result.current.updates.map((u) => u.uuid)).toEqual(["a", "b"]);
    expect(result.current.updates.every((u) => u.siteMatch === false)).toBe(true);
  });
});

/** 渲染 hook 并灌入一批待更新记录 */
async function setup(records: TBatchUpdateRecord[]) {
  const view = renderHook(() => useBatchUpdate());
  await act(async () => {});
  await runCheck(records);
  await waitFor(() => expect(view.result.current.updates).toHaveLength(records.length));
  return view;
}

const okItem = (uuid: string): TBatchUpdateResult => ({ ok: true, items: [{ uuid, success: true }] });

describe("批量更新 Hook useBatchUpdate 行级状态", () => {
  it("点击行内更新后该行立刻进入 working，不等服务端返回", async () => {
    let resolveAction!: (value: unknown) => void;
    h.requestBatchUpdateListAction.mockImplementationOnce(
      () => new Promise((resolve) => (resolveAction = resolve as (value: unknown) => void))
    );
    const { result } = await setup([mkRecord("a")]);

    act(() => result.current.onUpdate(result.current.updates[0]));

    expect(result.current.rowStates.a).toEqual({ phase: "working" });
    expect(result.current.batchProgress).toBeNull();

    await act(async () => resolveAction(okItem("a")));
    expect(result.current.rowStates.a.phase).toBe("success");
  });

  it("单行更新不占用顶部批量进度条", async () => {
    h.requestBatchUpdateListAction.mockResolvedValueOnce(okItem("a"));
    const { result } = await setup([mkRecord("a")]);

    await act(async () => result.current.onUpdate(result.current.updates[0]));

    expect(result.current.batchProgress).toBeNull();
  });

  it("服务端返回失败时该行停在 fail 并带上原因，重试可再次发起", async () => {
    h.requestBatchUpdateListAction.mockResolvedValueOnce({
      ok: true,
      items: [{ uuid: "a", success: false, error: "下载新版本失败" }],
    });
    const { result } = await setup([mkRecord("a")]);

    await act(async () => result.current.onUpdate(result.current.updates[0]));

    expect(result.current.rowStates.a).toEqual({ phase: "fail", error: "下载新版本失败" });
    expect(result.current.updates).toHaveLength(1);

    h.requestBatchUpdateListAction.mockResolvedValueOnce(okItem("a"));
    await act(async () => result.current.onUpdate(result.current.updates[0]));

    expect(result.current.rowStates.a.phase).toBe("success");
  });

  it("更新成功的行先停留展示，再退场并从列表移除", async () => {
    h.requestBatchUpdateListAction.mockResolvedValueOnce(okItem("a"));
    const { result } = await setup([mkRecord("a"), mkRecord("b")]);

    await act(async () => result.current.onUpdate(result.current.updates[0]));

    expect(result.current.rowStates.a.phase).toBe("success");
    expect(result.current.updates.map((u) => u.uuid)).toEqual(["a", "b"]);

    await waitFor(() => expect(result.current.rowStates.a?.phase).toBe("exiting"), { timeout: 3000 });
    await waitFor(() => expect(result.current.updates.map((u) => u.uuid)).toEqual(["b"]), { timeout: 3000 });
  });
});

describe("批量更新 Hook useBatchUpdate 批量进度", () => {
  it("批量更新先把选中行全部置为排队，再按序推进并汇总", async () => {
    let resolveFirst!: (value: unknown) => void;
    h.requestBatchUpdateListAction
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve as (value: unknown) => void)))
      .mockResolvedValueOnce({ ok: true, items: [{ uuid: "b", success: false, error: "boom" }] });
    const { result } = await setup([mkRecord("a"), mkRecord("b")]);

    act(() => {
      result.current.onToggle("a");
      result.current.onToggle("b");
    });
    act(() => result.current.onUpdateSelected());

    expect(result.current.rowStates.a.phase).toBe("working");
    expect(result.current.rowStates.b.phase).toBe("queued");
    expect(result.current.batchProgress).toEqual({ done: 0, total: 2, failed: 0, finished: false });

    await act(async () => resolveFirst(okItem("a")));

    await waitFor(() => expect(result.current.batchProgress?.finished).toBe(true), { timeout: 3000 });
    expect(result.current.batchProgress).toEqual({ done: 2, total: 2, failed: 1, finished: true });
    expect(h.toastWarning).toHaveBeenCalledWith(t("install:updatepage.batch_done_partial", { updated: 1, failed: 1 }));
  });

  it("批量全部成功时汇总 toast 只弹一次", async () => {
    h.requestBatchUpdateListAction.mockResolvedValueOnce(okItem("a")).mockResolvedValueOnce(okItem("b"));
    const { result } = await setup([mkRecord("a"), mkRecord("b")]);

    act(() => result.current.onToggleAll());
    await act(async () => result.current.onUpdateSelected());

    await waitFor(() => expect(result.current.batchProgress?.finished).toBe(true), { timeout: 3000 });
    expect(h.toastSuccess).toHaveBeenCalledTimes(1);
    expect(h.toastSuccess).toHaveBeenCalledWith(t("install:updatepage.batch_done", { count: 2 }));
  });

  it("更新过程中的 refreshRecord 广播不会冲掉行状态", async () => {
    let resolveFirst!: (value: unknown) => void;
    h.requestBatchUpdateListAction.mockImplementationOnce(
      () => new Promise((resolve) => (resolveFirst = resolve as (value: unknown) => void))
    );
    const { result } = await setup([mkRecord("a"), mkRecord("b")]);

    act(() => result.current.onUpdate(result.current.updates[0]));

    // 服务端装完即广播刷新；此时页面仍在展示 a 的进行中状态，不能被全量刷新冲掉
    h.record = { checktime: 300, list: [mkRecord("b")] };
    await act(async () => h.handlers.onScriptUpdateCheck({ refreshRecord: true }));

    expect(result.current.rowStates.a.phase).toBe("working");
    expect(result.current.updates.map((u) => u.uuid)).toEqual(["a", "b"]);

    await act(async () => resolveFirst(okItem("a")));
    expect(result.current.rowStates.a.phase).toBe("success");

    // 行退场后才补做那次被推迟的全量刷新
    await waitFor(() => expect(result.current.updates.map((u) => u.uuid)).toEqual(["b"]), { timeout: 3000 });
  });
});

describe("批量更新 Hook useBatchUpdate 更新数据过期", () => {
  /** 让下一次重新检查产出指定记录，模拟服务端重新检查后的新快照 */
  function recheckYields(records: TBatchUpdateRecord[]) {
    h.requestCheckScriptUpdate.mockImplementationOnce(() => {
      h.record = { checktime: 400, list: records };
      return Promise.resolve();
    });
  }

  it("服务端回报缓存失效时自动重新检查一次并续做剩余更新", async () => {
    h.requestBatchUpdateListAction
      .mockResolvedValueOnce({ ok: false, reason: "record_expired", items: [] })
      .mockResolvedValueOnce(okItem("a"));
    const { result } = await setup([mkRecord("a")]);
    recheckYields([mkRecord("a")]);

    await act(async () => result.current.onUpdate(result.current.updates[0]));

    await waitFor(() => expect(result.current.rowStates.a?.phase).toBe("success"));
    expect(h.requestCheckScriptUpdate).toHaveBeenCalledWith({ checkType: "user" });
    expect(h.requestBatchUpdateListAction).toHaveBeenCalledTimes(2);
    expect(result.current.recordExpired).toBe(false);
  });

  it("重新检查后已不需要更新的条目静默出队，不计为失败", async () => {
    h.requestBatchUpdateListAction.mockResolvedValueOnce({ ok: false, reason: "record_expired", items: [] });
    const { result } = await setup([mkRecord("a")]);
    recheckYields([]);

    await act(async () => result.current.onUpdate(result.current.updates[0]));

    await waitFor(() => expect(result.current.updates).toHaveLength(0));
    expect(h.requestBatchUpdateListAction).toHaveBeenCalledTimes(1);
    expect(result.current.recordExpired).toBe(false);
    expect(result.current.rowStates.a).toBeUndefined();
  });

  it("批量更新中途失效时重新检查并接着推进剩余条目", async () => {
    h.requestBatchUpdateListAction
      .mockResolvedValueOnce(okItem("a"))
      .mockResolvedValueOnce({ ok: false, reason: "record_expired", items: [] })
      .mockResolvedValueOnce(okItem("b"));
    const { result } = await setup([mkRecord("a"), mkRecord("b")]);
    recheckYields([mkRecord("b")]);

    act(() => result.current.onToggleAll());
    await act(async () => result.current.onUpdateSelected());

    await waitFor(() => expect(result.current.batchProgress?.finished).toBe(true), { timeout: 3000 });
    expect(result.current.batchProgress).toEqual({ done: 2, total: 2, failed: 0, finished: true });
    expect(h.toastSuccess).toHaveBeenCalledWith(t("install:updatepage.batch_done", { count: 2 }));
    expect(result.current.recordExpired).toBe(false);
  });

  it("重新检查后仍然失效才提示过期且不留下行状态", async () => {
    h.requestBatchUpdateListAction
      .mockResolvedValueOnce({ ok: false, reason: "record_expired", items: [] })
      .mockResolvedValueOnce({ ok: false, reason: "record_expired", items: [] });
    const { result } = await setup([mkRecord("a")]);
    recheckYields([mkRecord("a")]);

    await act(async () => result.current.onUpdate(result.current.updates[0]));

    await waitFor(() => expect(result.current.recordExpired).toBe(true));
    expect(result.current.rowStates.a).toBeUndefined();
    expect(result.current.updates).toHaveLength(1);
  });

  it("重新检查更新后清除过期提示", async () => {
    h.requestBatchUpdateListAction
      .mockResolvedValueOnce({ ok: false, reason: "record_expired", items: [] })
      .mockResolvedValueOnce({ ok: false, reason: "record_expired", items: [] });
    const { result } = await setup([mkRecord("a")]);
    recheckYields([mkRecord("a")]);
    await act(async () => result.current.onUpdate(result.current.updates[0]));
    await waitFor(() => expect(result.current.recordExpired).toBe(true));

    act(() => result.current.onCheckNow());

    expect(result.current.recordExpired).toBe(false);
  });
});

describe("批量更新 Hook useBatchUpdate 不再自动关闭页面", () => {
  // 旧版本的更新页会在 autoclose 秒后自行关闭，用户读不完就没了(#1715)。
  // 参数可能残留在被恢复的标签页里，因此这里断言的是「带着参数也不关」。
  it("URL 仍带 autoclose 参数时也不会自行关闭", async () => {
    const close = vi.spyOn(window, "close").mockImplementation(() => {});
    vi.useFakeTimers();
    window.history.replaceState({}, "", "/?autoclose=1");
    try {
      renderHook(() => useBatchUpdate());
      await act(async () => {});

      await act(async () => {
        vi.advanceTimersByTime(30_000);
      });

      expect(close).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      window.history.replaceState({}, "", "/");
      close.mockRestore();
    }
  });
});

describe("批量更新 Hook useBatchUpdate 查看更新的脚本", () => {
  it("跳转到 options 脚本列表", async () => {
    const { result } = await setup([mkRecord("a")]);

    act(() => result.current.onOpenScriptList());

    expect(h.openInCurrentTab).toHaveBeenCalledWith("/src/options.html#/");
  });
});
