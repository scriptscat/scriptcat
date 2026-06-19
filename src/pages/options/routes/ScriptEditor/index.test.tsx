// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Script } from "@App/app/repo/scripts";
import { SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_NORMAL } from "@App/app/repo/scripts";

const {
  invalidateResourcePane,
  invalidateSettingsPane,
  preloadSettingsPane,
  preloadStoragePane,
  usePreloadSettingsPane,
  saveScript,
} = vi.hoisted(() => ({
  invalidateResourcePane: vi.fn(),
  invalidateSettingsPane: vi.fn(),
  preloadSettingsPane: vi.fn(() => Promise.resolve()),
  preloadStoragePane: vi.fn(() => Promise.resolve()),
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

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ uuid: script.uuid }),
  useSearchParams: () => [new URLSearchParams()],
}));

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
vi.mock("./saveScript", () => ({ saveScript, SAVE_CANCELED: "SAVE_CANCELED" }));
vi.mock("./useActiveEditorFocus", () => ({ useActiveEditorFocus: vi.fn() }));
vi.mock("./tabs/ResourcePane", () => ({
  default: () => null,
  invalidateResourcePane,
  usePreloadResourcePane: vi.fn(),
}));
vi.mock("./tabs/CodePane", () => ({
  CodePane: ({
    onSave,
    tab,
  }: {
    onSave: (script: Script, editor: { getValue: () => string }) => void;
    tab: { script: Script };
  }) => <button data-testid="save" onClick={() => onSave(tab.script, { getValue: () => "updated code" })} />,
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
  invalidateStoragePane: vi.fn(),
  preloadStoragePane,
}));
vi.mock("@App/pages/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => children,
  AlertDialogAction: ({ children }: { children: React.ReactNode }) => children,
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => children,
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

describe("ScriptEditor 延迟面板缓存", () => {
  it("保存成功后应使当前脚本的资源与设置缓存失效", async () => {
    render(<ScriptEditor />);
    fireEvent.click(await screen.findByTestId("save"));

    await waitFor(() => expect(invalidateResourcePane).toHaveBeenCalledWith("u1"));
    expect(invalidateSettingsPane).toHaveBeenCalledWith("u1");
  });

  it("保存失败时不应使资源缓存失效", async () => {
    saveScript.mockRejectedValue(new Error("boom"));
    render(<ScriptEditor />);
    fireEvent.click(await screen.findByTestId("save"));

    await waitFor(() => expect(saveScript).toHaveBeenCalledOnce());
    expect(invalidateResourcePane).not.toHaveBeenCalled();
    expect(invalidateSettingsPane).not.toHaveBeenCalled();
  });

  it("悬浮储存标签时应以当前脚本 UUID 启动预加载", async () => {
    render(<ScriptEditor />);

    fireEvent.pointerEnter(await screen.findByTestId("preload-storage"));

    expect(preloadStoragePane).toHaveBeenCalledWith("u1");
  });
});
