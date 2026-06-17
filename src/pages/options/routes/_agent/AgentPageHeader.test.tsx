import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { Server } from "lucide-react";
import { AgentPageHeader } from "./AgentPageHeader";

afterEach(() => cleanup());

describe("AgentPageHeader 统一页头", () => {
  it("渲染标题与副标题", () => {
    render(<AgentPageHeader icon={Server} title="模型服务" subtitle="管理 AI 模型提供商" />);
    expect(screen.getByText("模型服务")).toBeInTheDocument();
    expect(screen.getByText("管理 AI 模型提供商")).toBeInTheDocument();
  });
  it("渲染右侧操作区", () => {
    render(<AgentPageHeader icon={Server} title="t" subtitle="s" actions={<button>添加</button>} />);
    expect(screen.getByText("添加")).toBeInTheDocument();
  });
});
