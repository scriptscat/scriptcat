import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { Server } from "lucide-react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { AgentPageHeader } from "./AgentPageHeader";

beforeAll(() => initTestLanguage("zh-CN"));
afterEach(() => cleanup());

describe("AgentPageHeader 统一页头", () => {
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
        actions={<button data-testid="primary-action">{"添加"}</button>}
      />
    );
    const docs = screen.getByTestId("page-header-docs");
    const action = screen.getByTestId("primary-action");
    // 文档按钮在 DOM 顺序中位于主操作之前
    expect(docs.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
