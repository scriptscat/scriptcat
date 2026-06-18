// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { t } from "@App/locales/locales";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { McpDetailSheet } from "./McpDetailSheet";

beforeAll(() => initTestLanguage("zh-CN"));
afterEach(() => cleanup());

const server = { id: "s1", name: "本地工具", url: "http://x", enabled: true, createtime: 0, updatetime: 0 } as any;
const tools = [
  {
    serverId: "s1",
    name: "search",
    description: "搜索引擎",
    inputSchema: { type: "object", properties: { q: { type: "string" }, limit: { type: "number" } }, required: ["q"] },
  },
] as any;
const resources = [{ serverId: "s1", uri: "file://a", name: "文件A", description: "" }] as any;

describe("McpDetailSheet MCP 详情抽屉", () => {
  it("loading 时显示加载文案", () => {
    render(
      <McpDetailSheet open server={server} onOpenChange={() => {}} tools={[]} resources={[]} prompts={[]} loading />
    );
    expect(screen.getByText(t("agent:mcp_loading"))).toBeInTheDocument();
  });

  it("渲染工具条目（名称 + 描述）", () => {
    render(
      <McpDetailSheet
        open
        server={server}
        onOpenChange={() => {}}
        tools={tools}
        resources={resources}
        prompts={[]}
        loading={false}
      />
    );
    expect(screen.getByText("search")).toBeInTheDocument();
    expect(screen.getByText("搜索引擎")).toBeInTheDocument();
  });

  it("切换到资源 tab 显示资源条目", () => {
    render(
      <McpDetailSheet
        open
        server={server}
        onOpenChange={() => {}}
        tools={tools}
        resources={resources}
        prompts={[]}
        loading={false}
      />
    );
    // Radix Tabs 在 mousedown(左键) 时切换标签——真实点击即包含此事件
    fireEvent.mouseDown(screen.getByTestId("tab-resources"), { button: 0 });
    expect(screen.getByText("文件A")).toBeInTheDocument();
  });
});
