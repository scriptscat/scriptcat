import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";

// 用 hoisted 持有可在测试内变更的主题与 monaco 桩，供被提升的 vi.mock 工厂引用
const h = vi.hoisted(() => {
  const makeEditor = () => ({
    setModel: vi.fn(),
    setValue: vi.fn(),
    getValue: () => "",
    getModel: () => null,
    dispose: vi.fn(),
    onDidChangeContent: () => ({ dispose: vi.fn() }),
    removeDecorations: vi.fn(),
    createDecorationsCollection: vi.fn(),
  });
  return {
    resolvedTheme: "light" as string,
    setTheme: vi.fn(),
    createDiffEditor: vi.fn((_container?: unknown, _options?: any) => makeEditor()),
    create: vi.fn((_container?: unknown, _options?: any) => makeEditor()),
    createModel: vi.fn(() => ({
      dispose: vi.fn(),
      onDidChangeContent: () => ({ dispose: vi.fn() }),
      getValue: () => "",
    })),
  };
});

vi.mock("monaco-editor", () => ({
  editor: {
    create: h.create,
    createDiffEditor: h.createDiffEditor,
    createModel: h.createModel,
    setTheme: h.setTheme,
    setModelMarkers: vi.fn(),
  },
  Range: class {},
}));
vi.mock("./theme", () => ({ resolveMonacoTheme: (t: string) => t }));
vi.mock("@App/pkg/utils/monaco-editor", () => ({
  registerEditor: vi.fn(),
  LinterWorkerController: { sendLinterMessage: vi.fn(), hookAddListener: vi.fn(), hookRemoveListener: vi.fn() },
}));
vi.mock("@App/pkg/utils/monaco-editor/eslintFixCache", () => ({
  clearModelEslintFixes: vi.fn(),
  getModelEslintFixKey: vi.fn(),
}));
vi.mock("@App/pages/store/global", () => ({
  systemConfig: { getEslintConfig: async () => "{}", getEnableEslint: async () => false },
}));
vi.mock("@App/pages/components/theme-provider", () => ({ useTheme: () => ({ resolvedTheme: h.resolvedTheme }) }));

import CodeEditor from "./index";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  h.resolvedTheme = "light";
});

describe("CodeEditor 可访问性与主题", () => {
  it("accessibilitySupport 应为 auto（不关闭辅助功能，利于屏幕阅读器/键盘）", async () => {
    await act(async () => {
      render(<CodeEditor id="ed-a11y" code="const a = 1;" diffCode="" editable />);
    });
    expect(h.create).toHaveBeenCalled();
    const opts = h.create.mock.calls[0][1];
    expect(opts.accessibilitySupport).toBe("auto");
  });

  it("diff 编辑器在主题切换时也应调用 editor.setTheme（不能只对普通 editor 生效）", async () => {
    const { rerender } = render(<CodeEditor id="ed-diff" code="const a = 2;" diffCode="const a = 1;" />);
    await act(async () => {});
    expect(h.createDiffEditor).toHaveBeenCalled();

    h.setTheme.mockClear();
    // 切换主题并重渲染：diff 预览必须随之更新主题
    h.resolvedTheme = "dark";
    await act(async () => {
      rerender(<CodeEditor id="ed-diff" code="const a = 2;" diffCode="const a = 1;" />);
    });
    expect(h.setTheme).toHaveBeenCalledWith("dark");
  });
});
