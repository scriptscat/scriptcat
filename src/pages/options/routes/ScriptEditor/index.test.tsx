import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Script } from "@App/app/repo/scripts";
import { SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_NORMAL } from "@App/app/repo/scripts";

const {
  invalidateResourcePane,
  invalidateSettingsPane,
  invalidateStoragePane,
  preloadSettingsPane,
  preloadStoragePane,
  usePreloadSettingsPane,
  usePreloadStoragePane,
  saveScript,
} = vi.hoisted(() => ({
  invalidateResourcePane: vi.fn(),
  invalidateSettingsPane: vi.fn(),
  invalidateStoragePane: vi.fn(),
  preloadSettingsPane: vi.fn(() => Promise.resolve()),
  preloadStoragePane: vi.fn(() => Promise.resolve()),
  usePreloadStoragePane: vi.fn(() => Promise.resolve()),
  usePreloadSettingsPane: vi.fn(),
  saveScript: vi.fn(),
}));

const script = {
  uuid: "u1",
  name: "脚本A",
  namespace: "ns",
  metadata: { name: ["脚本A"] },
  type: SCRIPT_TYPE_NORMAL,
  status: SCRIPT_STATUS_ENABLE,
  sort: 0,
  runStatus: "complete",
  createtime: 100,
  updatetime: 100,
  checktime: 0,
} as unknown as Script;

vi.mock("@App/pages/options/routes/ScriptList/hooks", () => ({
  useScriptDataManagement: () => ({ scriptList: [script], setScriptList: vi.fn(), loadingList: false }),
}));

vi.mock("@App/pages/components/use-is-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@App/pages/store/features/script", () => ({
  runtimeClient: { runScript: vi.fn() },
  scriptClient: { install: vi.fn(), deletes: vi.fn() },
}));
vi.mock("./editorScriptLoaders", () => ({
  emptyScript: vi.fn(),
  loadScriptCode: vi.fn(async () => "code"),
}));
vi.mock("./saveScript", () => ({ saveScript, SAVE_CANCELED: "SAVE_CANCELED", SAVE_EMPTY_NAME: "SAVE_EMPTY_NAME" }));
vi.mock("./useActiveEditorFocus", () => ({ useActiveEditorFocus: vi.fn() }));
vi.mock("./tabs/ResourcePane", () => ({
  default: () => null,
  invalidateResourcePane,
  usePreloadResourcePane: vi.fn(),
}));
vi.mock("./tabs/CodePane", () => ({
  CodePane: ({
    onChange,
    onSave,
    tab,
  }: {
    onChange: (code: string) => void;
    onSave: (script: Script, editor: { getValue: () => string }) => void;
    tab: { script: Script };
  }) => (
    <>
      <button data-testid="change" onClick={() => onChange("changed code")} />
      <button data-testid="save" onClick={() => onSave(tab.script, { getValue: () => "updated code" })} />
    </>
  ),
}));
vi.mock("./ScriptListPanel", () => ({ default: () => null }));
vi.mock("./EditorTabs", () => ({ default: () => null }));
vi.mock("./EditorToolbar", () => ({
  default: ({ onPreloadSubView }: { onPreloadSubView: (view: "storage") => void }) => (
    <button data-testid="preload-storage" onPointerEnter={() => onPreloadSubView("storage")} />
  ),
}));
vi.mock("./EditorStatusBar", () => ({ default: () => null }));
vi.mock("./MobileEditor", () => ({ default: () => null }));
vi.mock("./tabs/SettingsPane", () => ({
  default: () => null,
  invalidateSettingsPane,
  preloadSettingsPane,
  usePreloadSettingsPane,
}));
vi.mock("./tabs/StoragePane", () => ({
  default: () => null,
  invalidateStoragePane,
  preloadStoragePane,
  usePreloadStoragePane,
}));
vi.mock("@App/pages/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => children,
  AlertDialogAction: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
  AlertDialogCancel: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => children,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => children,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => children,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => children,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => children,
}));

import ScriptEditor from "./index";

beforeEach(() => {
  saveScript.mockResolvedValue({ script, updated: true, updatetime: 200 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderEditor = () => {
  const router = createMemoryRouter([{ path: "/script/editor/:uuid", element: <ScriptEditor /> }], {
    initialEntries: ["/script/editor/u1"],
  });
  return render(<RouterProvider router={router} />);
};

describe("ScriptEditor 延迟面板缓存", () => {
  it("保存成功后应使当前脚本的资源、设置与储存缓存失效", async () => {
    renderEditor();
    const save = await screen.findByTestId("save");
    await act(async () => fireEvent.click(save));

    expect(invalidateResourcePane).toHaveBeenCalledWith("u1");
    expect(invalidateSettingsPane).toHaveBeenCalledWith("u1");
    expect(invalidateStoragePane).toHaveBeenCalledWith("u1");
  });

  it("保存失败时不应使资源缓存失效", async () => {
    saveScript.mockRejectedValue(new Error("boom"));
    renderEditor();
    const save = await screen.findByTestId("save");
    await act(async () => fireEvent.click(save));

    expect(saveScript).toHaveBeenCalledOnce();
    expect(invalidateResourcePane).not.toHaveBeenCalled();
    expect(invalidateSettingsPane).not.toHaveBeenCalled();
    expect(invalidateStoragePane).not.toHaveBeenCalled();
  });

  it("悬浮储存标签时应以当前脚本 UUID 启动预加载", async () => {
    renderEditor();
    // 工具栏（preload-storage）先于脚本异步加载渲染；须等 tab 就绪（save 出现）后 activeUuid 才是 u1
    await screen.findByTestId("save");

    fireEvent.pointerEnter(await screen.findByTestId("preload-storage"));

    expect(preloadStoragePane).toHaveBeenCalledWith("u1");
  });
});

describe("ScriptEditor 未保存导航保护", () => {
  it("脚本有改动时应阻止页内导航，确认后才离开编辑器", async () => {
    const router = createMemoryRouter(
      [
        { path: "/script/editor/:uuid", element: <ScriptEditor /> },
        { path: "/settings", element: <div data-testid="settings-page" /> },
      ],
      { initialEntries: ["/script/editor/u1"] }
    );
    render(<RouterProvider router={router} />);

    fireEvent.click(await screen.findByTestId("change"));
    await act(async () => void router.navigate("/settings"));

    expect(router.state.location.pathname).toBe("/script/editor/u1");
    expect(screen.getByText("editor:script_modified_close_confirm")).toBeInTheDocument();

    fireEvent.click(screen.getByText("editor:confirm"));

    expect(await screen.findByTestId("settings-page")).toBeInTheDocument();
  });
});
