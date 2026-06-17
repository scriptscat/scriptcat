import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { initLanguage } from "@App/locales/locales";
import type { AgentModelConfig, SkillSummary } from "@App/app/service/agent/core/types";
import ChatInput from "./ChatInput";

beforeEach(() => initLanguage("zh-CN"));
afterEach(() => cleanup());

const model = (id: string): AgentModelConfig => ({
  id,
  name: id,
  provider: "openai",
  apiBaseUrl: "",
  apiKey: "",
  model: id,
});

function setup(over?: Partial<React.ComponentProps<typeof ChatInput>>) {
  const props: React.ComponentProps<typeof ChatInput> = {
    models: [model("gpt-4o")],
    selectedModelId: "gpt-4o",
    onModelChange: vi.fn(),
    onSend: vi.fn(),
    onStop: vi.fn(),
    isStreaming: false,
    ...over,
  };
  render(<ChatInput {...props} />);
  return props;
}

describe("聊天输入框 ChatInput", () => {
  it("输入文本点击发送触发 onSend 并清空输入", () => {
    const onSend = vi.fn();
    setup({ onSend });
    const ta = screen.getByTestId("chat-textarea") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "  你好  " } });
    fireEvent.click(screen.getByTestId("chat-send"));
    expect(onSend).toHaveBeenCalledWith("你好");
    expect(ta.value).toBe("");
  });

  it("空输入时不触发发送", () => {
    const onSend = vi.fn();
    setup({ onSend });
    fireEvent.click(screen.getByTestId("chat-send"));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("Enter 发送，Shift+Enter 不发送", () => {
    const onSend = vi.fn();
    setup({ onSend });
    const ta = screen.getByTestId("chat-textarea");
    fireEvent.change(ta, { target: { value: "发我" } });
    fireEvent.keyDown(ta, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("发我");
  });

  it("流式中展示停止按钮并触发 onStop", () => {
    const onStop = vi.fn();
    setup({ isStreaming: true, onStop });
    fireEvent.click(screen.getByTestId("chat-stop"));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("输入斜杠时展示 Skill 命令菜单并可选择填充", () => {
    const skill = (name: string, description: string): SkillSummary => ({
      name,
      description,
      toolNames: [],
      referenceNames: [],
      installtime: 1,
      updatetime: 1,
    });
    const skills: SkillSummary[] = [skill("search", "搜索"), skill("translate", "翻译")];
    setup({ skills });
    const ta = screen.getByTestId("chat-textarea") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "/sea" } });
    expect(screen.getByTestId("slash-menu")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId("slash-item-search"));
    expect(ta.value).toBe("/search ");
  });
});
