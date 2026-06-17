import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { initLanguage, t } from "@App/locales/locales";
import type { TBatchUpdateRecord, TBatchUpdateRecordObject } from "@App/app/service/service_worker/types";

// useBatchUpdate 通过消息总线订阅检查状态、拉取记录并发起动作；这里整体打桩，
// 只验证「用户主动点检查更新 → 完成后弹 toast」的反馈逻辑。
const h = vi.hoisted(() => ({
  record: { checktime: 0, list: [] } as TBatchUpdateRecordObject,
  handlers: {} as Record<string, (msg: unknown) => void>,
  getBatchUpdateRecordLite: vi.fn(),
  fetchCheckUpdateStatus: vi.fn(() => Promise.resolve()),
  sendUpdatePageOpened: vi.fn(() => Promise.resolve()),
  requestCheckScriptUpdate: vi.fn(() => Promise.resolve()),
  requestBatchUpdateListAction: vi.fn(() => Promise.resolve()),
  requestOpenUpdatePageByUUID: vi.fn(() => Promise.resolve()),
  toastSuccess: vi.fn(),
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

vi.mock("sonner", () => ({ toast: { success: h.toastSuccess } }));

import { useBatchUpdate } from "./hooks";

function mkRecord(uuid: string, newVersion = "1.1.0"): TBatchUpdateRecord {
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
    sites: [],
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

beforeEach(() => {
  initLanguage("zh-CN");
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

    await waitFor(() => expect(h.toastSuccess).toHaveBeenCalledTimes(1));
    expect(h.toastSuccess.mock.calls[0][0]).toContain("1");
    expect(h.toastSuccess.mock.calls[0][0]).toBe(t("install:updatepage.toast_found", { count: 1 }));
  });

  it("用户主动检查后无更新时弹出「均为最新」toast", async () => {
    const { result } = renderHook(() => useBatchUpdate());
    await act(async () => {});

    act(() => result.current.onCheckNow());
    await runCheck([]);

    await waitFor(() => expect(h.toastSuccess).toHaveBeenCalledTimes(1));
    expect(h.toastSuccess.mock.calls[0][0]).toBe(t("install:updatepage.toast_uptodate"));
  });

  it("非用户发起的后台检查完成时不弹 toast", async () => {
    renderHook(() => useBatchUpdate());
    await act(async () => {});

    await runCheck([mkRecord("a")]);
    await new Promise((r) => setTimeout(r, 10));

    expect(h.toastSuccess).not.toHaveBeenCalled();
  });
});
