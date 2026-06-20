import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { initLanguage } from "@App/locales/locales";
import { synchronizeClient, pinToTop } from "@App/pages/store/features/script";

// 列表数据 Hook 整体打桩，返回带 sort 的脚本，便于校验批量操作的排序
const { scripts } = vi.hoisted(() => ({
  scripts: [
    { uuid: "u1", name: "A", metadata: {}, sort: 2 },
    { uuid: "u2", name: "B", metadata: {}, sort: 0 },
    { uuid: "u3", name: "C", metadata: {}, sort: 1 },
  ],
}));

vi.mock("./hooks", () => {
  const data = { scriptList: scripts, setScriptList: () => {}, loadingList: false };
  const filters = { stats: { tagMap: {}, originMap: {} }, filterItems: [] };
  return {
    useScriptDataManagement: () => data,
    useScriptFilters: () => filters,
  };
});

// 业务请求打桩，重点观察导出/置顶接口
vi.mock("@App/pages/store/features/script", () => ({
  requestDeleteScripts: vi.fn(() => Promise.resolve()),
  requestEnableScript: vi.fn(),
  requestRunScript: vi.fn(),
  requestStopScript: vi.fn(),
  sortScript: vi.fn(),
  scriptClient: { requestCheckUpdate: vi.fn() },
  synchronizeClient: { export: vi.fn(() => Promise.resolve()) },
  pinToTop: vi.fn(() => Promise.resolve()),
}));

vi.mock("@App/pages/components/ui/toast", () => ({
  notify: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    promise: vi.fn(),
    undo: vi.fn(),
    dismiss: vi.fn(),
  },
}));

// 轻量替身：暴露选中与批量导出/置顶的触发按钮
vi.mock("./ScriptTable", () => ({
  default: (props: { toggleSelect: (uuid: string) => void; onBatchExport: () => void; onBatchPinTop: () => void }) => (
    <>
      <button onClick={() => props.toggleSelect("u1")}>{"sel-u1"}</button>
      <button onClick={() => props.toggleSelect("u3")}>{"sel-u3"}</button>
      <button onClick={() => props.onBatchExport()}>{"batch-export"}</button>
      <button onClick={() => props.onBatchPinTop()}>{"batch-pin"}</button>
    </>
  ),
}));
vi.mock("./ScriptCard", () => ({ default: () => null }));
vi.mock("./ScriptListMobile", () => ({ default: () => null }));
vi.mock("@App/pages/components/use-is-mobile", () => ({ useIsMobile: () => false }));

import ScriptList from "./index";

beforeEach(() => {
  initLanguage("zh-CN");
  vi.clearAllMocks();
});

afterEach(() => cleanup());

describe("脚本列表批量导出", () => {
  it("批量导出应按 sort 顺序调用导出接口", async () => {
    render(<ScriptList />, { wrapper: MemoryRouter });
    fireEvent.click(screen.getByText("sel-u1")); // sort 2
    fireEvent.click(screen.getByText("sel-u3")); // sort 1
    fireEvent.click(screen.getByText("batch-export"));

    // 选中 u1(sort2) 与 u3(sort1)，按 sort 升序导出应为 [u3, u1]
    await waitFor(() => expect(synchronizeClient.export).toHaveBeenCalledWith(["u3", "u1"]));
  });

  it("未选中任何脚本时不应调用导出接口", () => {
    render(<ScriptList />, { wrapper: MemoryRouter });
    fireEvent.click(screen.getByText("batch-export"));
    expect(synchronizeClient.export).not.toHaveBeenCalled();
  });
});

describe("脚本列表批量置顶", () => {
  it("批量置顶应按 sort 顺序调用置顶接口", async () => {
    render(<ScriptList />, { wrapper: MemoryRouter });
    fireEvent.click(screen.getByText("sel-u1")); // sort 2
    fireEvent.click(screen.getByText("sel-u3")); // sort 1
    fireEvent.click(screen.getByText("batch-pin"));

    await waitFor(() => expect(pinToTop).toHaveBeenCalledWith(["u3", "u1"]));
  });

  it("未选中任何脚本时不应调用置顶接口", () => {
    render(<ScriptList />, { wrapper: MemoryRouter });
    fireEvent.click(screen.getByText("batch-pin"));
    expect(pinToTop).not.toHaveBeenCalled();
  });
});
