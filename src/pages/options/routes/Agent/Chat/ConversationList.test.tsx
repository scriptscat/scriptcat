import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { t } from "@App/locales/locales";
import { initTestLanguage } from "@Tests/initTestLanguage";
import type { Conversation } from "@App/app/service/agent/core/types";
import ConversationList from "./ConversationList";

beforeAll(() => initTestLanguage("zh-CN"));
afterEach(() => cleanup());

const conv = (id: string, title: string): Conversation => ({
  id,
  title,
  modelId: "gpt-4o",
  createtime: 1,
  updatetime: 1,
});

function setup(over?: Partial<React.ComponentProps<typeof ConversationList>>) {
  const props = {
    conversations: [conv("a", "会话A"), conv("b", "会话B")],
    activeId: "a",
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    onDelete: vi.fn(),
    onRename: vi.fn(),
    onExport: vi.fn(),
    ...over,
  };
  render(<ConversationList {...props} />);
  return props;
}

describe("会话列表 ConversationList", () => {
  it("无会话时展示空状态", () => {
    setup({ conversations: [] });
    expect(screen.getByTestId("conv-empty")).toBeInTheDocument();
  });

  it("点击新建触发 onCreate", () => {
    const { onCreate } = setup();
    fireEvent.click(screen.getByTestId("conv-new"));
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("点击会话项触发 onSelect", () => {
    const { onSelect } = setup();
    fireEvent.click(screen.getByText("会话B"));
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("当前会话项标记为激活", () => {
    setup({ activeId: "b" });
    expect(screen.getByTestId("conv-item-b").dataset.active).toBe("true");
    expect(screen.getByTestId("conv-item-a").dataset.active).toBe("false");
  });

  it("重命名：编辑后确认触发 onRename", () => {
    const { onRename } = setup();
    fireEvent.click(screen.getByTestId("conv-rename-a"));
    const input = screen.getByTestId("conv-rename-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "新标题" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith("a", "新标题");
  });

  it("删除需二次确认后触发 onDelete", async () => {
    const { onDelete } = setup();
    fireEvent.click(screen.getByTestId("conv-delete-a"));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByText(t("common:confirm"), { selector: "button" }));
    expect(onDelete).toHaveBeenCalledWith("a");
  });

  it("运行中的会话显示运行指示", () => {
    setup({ runningIds: new Set(["a"]) });
    expect(screen.getByTestId("conv-running-a")).toBeInTheDocument();
  });

  it("搜索框按标题过滤会话(不区分大小写)", () => {
    setup({ conversations: [conv("a", "网络请求脚本"), conv("b", "批量重命名")] });
    const search = screen.getByTestId("conv-search") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "批量" } });
    expect(screen.queryByText("网络请求脚本")).toBeNull();
    expect(screen.getByText("批量重命名")).toBeInTheDocument();
  });

  it("搜索框复用基础 SearchInput 语义", () => {
    setup();
    const search = screen.getByLabelText(t("agent:chat_search_placeholder"));
    expect(search).toHaveAttribute("data-testid", "conv-search");
    expect(search.closest('[data-slot="search-input"]')).toBeInTheDocument();
  });

  it("搜索无结果时展示空状态", () => {
    setup({ conversations: [conv("a", "网络请求脚本")] });
    fireEvent.change(screen.getByTestId("conv-search"), { target: { value: "不存在的会话" } });
    expect(screen.getByTestId("conv-search-empty")).toBeInTheDocument();
  });

  it("提供 onCollapse 时展示面板折叠按钮", () => {
    const onCollapse = vi.fn();
    setup({ onCollapse });
    fireEvent.click(screen.getByTestId("conv-collapse"));
    expect(onCollapse).toHaveBeenCalledOnce();
  });

  it("未提供 onCollapse 时不展示折叠按钮(移动端)", () => {
    setup();
    expect(screen.queryByTestId("conv-collapse")).toBeNull();
  });
});
