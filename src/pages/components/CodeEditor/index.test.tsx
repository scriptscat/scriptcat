import { createRef, type ComponentRef } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, act, waitFor } from "@testing-library/react";

// 用 hoisted 持有可在测试内变更的主题与 monaco 桩，供被提升的 vi.mock 工厂引用
const h = vi.hoisted(() => {
  const makeEditor = () => ({
    revealLineInCenter: vi.fn(),
    setSelection: vi.fn(),
    setModel: vi.fn(),
    setValue: vi.fn(),
    updateOptions: vi.fn(),
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
    createDiffEditor: vi.fn((_container?: unknown, _options?: any) => {
      const modified = makeEditor();
      return { ...makeEditor(), getModifiedEditor: () => modified, __modified: modified };
    }),
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
  Range: class {
    constructor(
      public startLineNumber: number,
      public startColumn: number,
      public endLineNumber: number,
      public endColumn: number
    ) {}
  },
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
  systemConfig: {
    getEslintConfig: async () => "{}",
    getEnableEslint: async () => false,
    getEditorPreferences: async () => ({
      version: 1,
      fontSize: 15,
      mouseWheelScrollSensitivity: 1.75,
      smoothScrolling: false,
    }),
    watch: vi.fn((_key: string, callback: (value: any) => void) => {
      callback({
        version: 1,
        fontSize: 15,
        mouseWheelScrollSensitivity: 1.75,
        smoothScrolling: false,
      });
      return vi.fn();
    }),
  },
}));
vi.mock("@App/pages/components/theme-provider", () => ({ useTheme: () => ({ resolvedTheme: h.resolvedTheme }) }));

import CodeEditor from "./index";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  h.resolvedTheme = "light";
});

describe("CodeEditor 可访问性与主题", () => {
  it("应通过 ref 暴露当前普通编辑器实例", async () => {
    const ref = createRef<ComponentRef<typeof CodeEditor>>();

    await act(async () => {
      render(<CodeEditor ref={ref} id="ed-ref" code="const a = 1;" diffCode="" editable />);
    });

    await waitFor(() => expect(h.create).toHaveBeenCalled());
    expect(ref.current?.editor).toBe(h.create.mock.results[0].value);
  });

  it("accessibilitySupport 应为 auto（不关闭辅助功能，利于屏幕阅读器/键盘）", async () => {
    await act(async () => {
      render(<CodeEditor id="ed-a11y" code="const a = 1;" diffCode="" editable />);
    });
    await waitFor(() => expect(h.create).toHaveBeenCalled());
    const opts = h.create.mock.calls[0][1];
    expect(opts.accessibilitySupport).toBe("auto");
  });

  it("应把编辑器偏好传给 Monaco 运行时选项", async () => {
    await act(async () => {
      render(<CodeEditor id="ed-preferences" code="const a = 1;" diffCode="" editable />);
    });

    await waitFor(() => expect(h.create).toHaveBeenCalled());
    const opts = h.create.mock.calls[0][1];
    expect(opts).toMatchObject({
      fontSize: 15,
      mouseWheelScrollSensitivity: 1.75,
      smoothScrolling: false,
    });
  });

  it("diff 编辑器在主题切换时也应调用 editor.setTheme（不能只对普通 editor 生效）", async () => {
    const { rerender } = render(<CodeEditor id="ed-diff" code="const a = 2;" diffCode="const a = 1;" />);
    await waitFor(() => expect(h.createDiffEditor).toHaveBeenCalled());

    h.setTheme.mockClear();
    // 切换主题并重渲染：diff 预览必须随之更新主题
    h.resolvedTheme = "dark";
    await act(async () => {
      rerender(<CodeEditor id="ed-diff" code="const a = 2;" diffCode="const a = 1;" />);
    });
    expect(h.setTheme).toHaveBeenCalledWith("dark");
  });
});

describe("CodeEditor 就绪信号与定位", () => {
  it("内联 diff 也报告就绪——否则加载占位会一直留在无障碍树里说「正在加载」", async () => {
    const onReady = vi.fn();
    render(<CodeEditor id="ed-ready-diff" code="const a = 2;" diffCode="const a = 1;" onReady={onReady} />);
    await waitFor(() => expect(onReady).toHaveBeenCalled());
  });

  it("普通编辑器同样报告就绪", async () => {
    const onReady = vi.fn();
    await act(async () => {
      render(<CodeEditor id="ed-ready-plain" code="const a = 1;" diffCode="" onReady={onReady} />);
    });
    await waitFor(() => expect(onReady).toHaveBeenCalled());
  });

  it("revealLine 在普通编辑器上滚动并选中整行", async () => {
    const ref = createRef<ComponentRef<typeof CodeEditor>>();
    await act(async () => {
      render(<CodeEditor ref={ref} id="ed-reveal" code={"a\nb\nc"} diffCode="" />);
    });
    await waitFor(() => expect(h.create).toHaveBeenCalled());
    act(() => ref.current?.revealLine(2));
    const instance = h.create.mock.results[0].value;
    expect(instance.revealLineInCenter).toHaveBeenCalledWith(2);
    expect(instance.setSelection).toHaveBeenCalled();
  });

  it("revealLine 在 diff 预览里定位到修改侧——诊断说的是新版本的那一行", async () => {
    const ref = createRef<ComponentRef<typeof CodeEditor>>();
    render(<CodeEditor ref={ref} id="ed-reveal-diff" code={"a\nb"} diffCode={"a"} />);
    await waitFor(() => expect(h.createDiffEditor).toHaveBeenCalled());
    act(() => ref.current?.revealLine(2));
    const modified = (h.createDiffEditor.mock.results[0].value as any).__modified;
    expect(modified.revealLineInCenter).toHaveBeenCalledWith(2);
  });
});
