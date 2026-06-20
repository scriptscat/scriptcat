import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";

// Monaco 无法在 DOM 测试环境中渲染(需 worker),用轻量桩替换,仅暴露 props 供断言接线
vi.mock("@App/pages/components/CodeEditor", () => import("@Tests/mocks/CodeEditor.tsx"));

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

  it("提供 diff 统计时渲染 +N 与 −N", () => {
    render(<CodePreview code={code} diffStat={{ added: 42, removed: 18 }} />);
    expect(screen.getByText("+42")).toBeInTheDocument();
    expect(screen.getByText("−18")).toBeInTheDocument();
  });
});
