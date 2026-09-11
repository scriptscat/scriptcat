import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";

// Monaco 无法在 DOM 测试环境中渲染(需 worker),用轻量桩替换,仅暴露 props 供断言接线
vi.mock("@App/pages/components/CodeEditor", () => import("@Tests/mocks/CodeEditor.tsx"));

import { setEditorMounts } from "@Tests/mocks/CodeEditor";
import { CodePreview } from "./CodePreview";

const code = "// line1\nconst a = 1;\nconsole.log(a);";

beforeAll(() => initTestLanguage("zh-CN"));

afterEach(cleanup);

describe("CodePreview 代码卡", () => {
  it("渲染语言标签与行数", () => {
    render(<CodePreview code={code} />);
    expect(screen.getByText("JavaScript")).toBeInTheDocument();
    expect(screen.getByText("3 行")).toBeInTheDocument();
  });

  it("默认展开,把代码传给 Monaco 编辑器;折叠后不挂载编辑器", () => {
    render(<CodePreview code={code} />);
    const body = screen.getByTestId("code-body");
    expect(body).toBeInTheDocument();
    expect(body).toHaveAttribute("data-code", code);
    fireEvent.click(screen.getByTestId("code-toggle"));
    expect(screen.queryByTestId("code-body")).not.toBeInTheDocument();
  });

  it("全新安装(无 oldCode)时 diffCode 为空字符串", () => {
    render(<CodePreview code={code} />);
    expect(screen.getByTestId("code-body")).toHaveAttribute("data-diff", "");
  });

  it("更新态(oldCode 与 code 不同)时 diffCode 取旧代码以触发内联 diff", () => {
    const oldCode = "// old\nconst a = 0;";
    render(<CodePreview code={code} oldCode={oldCode} />);
    expect(screen.getByTestId("code-body")).toHaveAttribute("data-diff", oldCode);
  });

  it("oldCode 与 code 相同时不触发 diff(diffCode 为空)", () => {
    render(<CodePreview code={code} oldCode={code} />);
    expect(screen.getByTestId("code-body")).toHaveAttribute("data-diff", "");
  });

  it("点击复制将代码写入剪贴板", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<CodePreview code={code} />);
    fireEvent.click(screen.getByTestId("code-copy"));
    expect(writeText).toHaveBeenCalledWith(code);
  });

  it("点击全页面查看后在占满视口的对话框中查看代码,并可退出", () => {
    render(<CodePreview code={code} />);

    const fullscreenButton = screen.getByTestId("code-fullscreen");
    expect(fullscreenButton).toHaveAttribute("aria-label", "全屏查看代码");
    fireEvent.click(fullscreenButton);

    const dialog = screen.getByTestId("code-fullscreen-dialog");
    expect(dialog).toHaveClass("left-0", "top-0", "h-dvh", "w-dvw", "max-w-none");
    expect(within(dialog).getByTestId("code-body")).toHaveAttribute("data-code", code);

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.queryByTestId("code-fullscreen-dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("code-body")).toHaveAttribute("data-id", "install-code-preview");
  });

  it("更新态可在全屏预览中查看代码并隐藏加载骨架", () => {
    const oldCode = "// old\nconst a = 0;";
    render(<CodePreview code={code} oldCode={oldCode} />);

    fireEvent.click(screen.getByTestId("code-fullscreen"));

    const dialog = screen.getByTestId("code-fullscreen-dialog");
    expect(within(dialog).getByTestId("code-body")).toHaveAttribute("data-diff", oldCode);
    expect(within(dialog).queryByTestId("code-skeleton")).not.toBeInTheDocument();
  });

  it("按 Escape 关闭全屏并将焦点还给触发按钮", async () => {
    render(<CodePreview code={code} />);

    const fullscreenButton = screen.getByTestId("code-fullscreen");
    fullscreenButton.focus();
    fireEvent.click(fullscreenButton);
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-labelledby");

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByTestId("code-fullscreen-dialog")).not.toBeInTheDocument();
      expect(document.activeElement).toBe(fullscreenButton);
    });
  });

  it("默认折叠时仍可从全屏按钮打开代码", () => {
    render(<CodePreview code={code} defaultCollapsed />);

    expect(screen.queryByTestId("code-body")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("code-fullscreen"));

    expect(within(screen.getByTestId("code-fullscreen-dialog")).getByTestId("code-body")).toHaveAttribute(
      "data-code",
      code
    );
  });

  it("提供 diff 统计时渲染 +N 与 −N", () => {
    render(<CodePreview code={code} diffStat={{ added: 42, removed: 18 }} />);
    expect(screen.getByText("+42")).toBeInTheDocument();
    expect(screen.getByText("−18")).toBeInTheDocument();
  });
});

describe("CodePreview 编辑器加载期的占位", () => {
  afterEach(() => setEditorMounts(true));

  it("编辑器实例就绪前渲染代码骨架,而不是一块看着像加载失败的空白", () => {
    setEditorMounts(false);
    render(<CodePreview code={code} />);

    const skeleton = screen.getByTestId("code-skeleton");
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    expect(skeleton.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(3);
  });

  it("编辑器挂载后收起骨架", () => {
    render(<CodePreview code={code} />);

    expect(screen.queryByTestId("code-skeleton")).not.toBeInTheDocument();
  });
});
