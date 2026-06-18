// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { Server } from "lucide-react";
import { AgentEmptyState } from "./AgentEmptyState";

afterEach(() => cleanup());

describe("AgentEmptyState 空状态", () => {
  it("渲染标题/说明/操作", () => {
    render(
      <AgentEmptyState
        icon={Server}
        title="还没有配置模型"
        description="添加第一个模型"
        action={<button>{"添加模型"}</button>}
      />
    );
    expect(screen.getByText("还没有配置模型")).toBeInTheDocument();
    expect(screen.getByText("添加第一个模型")).toBeInTheDocument();
    expect(screen.getByText("添加模型")).toBeInTheDocument();
  });
  it("容器为带边框的圆角卡片", () => {
    render(<AgentEmptyState icon={Server} title="t" description="d" />);
    const root = screen.getByTestId("empty-state");
    expect(root.className).toContain("rounded-2xl");
    expect(root.className).toContain("border");
  });
  it("无 action 时仍正常渲染", () => {
    render(<AgentEmptyState icon={Server} title="空" description="说明" />);
    expect(screen.getByText("空")).toBeInTheDocument();
    expect(screen.getByText("说明")).toBeInTheDocument();
  });
});
