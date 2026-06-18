// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { Server } from "lucide-react";
import { initLanguage } from "@App/locales/locales";
import { AgentPageHeader } from "./AgentPageHeader";

beforeEach(() => initLanguage("zh-CN"));
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
  it("传入 docHref 时渲染文档按钮并指向链接", () => {
    render(<AgentPageHeader icon={Server} title="t" subtitle="s" docHref="https://docs.example.com" />);
    const docs = screen.getByTestId("page-header-docs");
    expect(docs).toBeInTheDocument();
    expect(docs).toHaveAttribute("href", "https://docs.example.com");
    expect(docs).toHaveAttribute("target", "_blank");
  });
  it("未传 docHref 时不渲染文档按钮", () => {
    render(<AgentPageHeader icon={Server} title="t" subtitle="s" />);
    expect(screen.queryByTestId("page-header-docs")).toBeNull();
  });
  it("docHref 与 actions 同时存在：文档按钮在操作区之前", () => {
    render(
      <AgentPageHeader
        icon={Server}
        title="t"
        subtitle="s"
        docHref="https://docs.example.com"
        actions={<button data-testid="primary-action">添加</button>}
      />
    );
    const docs = screen.getByTestId("page-header-docs");
    const action = screen.getByTestId("primary-action");
    // 文档按钮在 DOM 顺序中位于主操作之前
    expect(docs.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
