import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { initLanguage, t } from "@App/locales/locales";
import type { Conversation } from "@App/app/service/agent/core/types";
import ConversationList from "./ConversationList";

beforeEach(() => initLanguage("zh-CN"));
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
    fireEvent.click(await screen.findByRole("button", { name: t("common:confirm") }));
    expect(onDelete).toHaveBeenCalledWith("a");
  });

  it("运行中的会话显示运行指示", () => {
    setup({ runningIds: new Set(["a"]) });
    expect(screen.getByTestId("conv-running-a")).toBeInTheDocument();
  });
});
