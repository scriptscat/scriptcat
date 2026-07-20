import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { StrictMode } from "react";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { t } from "@App/locales/locales";
import { initTestLanguage } from "@Tests/initTestLanguage";
import type { AgentModelConfig, SkillSummary } from "@App/app/service/agent/core/types";
import ChatInput from "./ChatInput";

beforeAll(() => initTestLanguage("zh-CN"));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

  it("没有模型时展示空状态文案并禁用模型选择", () => {
    setup({ models: [], selectedModelId: "" });
    const trigger = screen.getByTestId("agent-model-select");
    expect(trigger).toHaveTextContent(t("agent:model_no_models"));
    expect(trigger).toBeDisabled();
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

  it("优化提示词时禁用输入并用模型响应替换内容", async () => {
    let resolveOptimize!: (value: string) => void;
    const onOptimizePrompt = vi.fn().mockReturnValue(
      new Promise<string>((resolve) => {
        resolveOptimize = resolve;
      })
    );
    setup({ onOptimizePrompt });
    const textarea = screen.getByTestId("chat-textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "  原始提示词  " } });
    fireEvent.click(screen.getByTestId("chat-optimize-prompt"));

    expect(onOptimizePrompt).toHaveBeenCalledWith("原始提示词", "gpt-4o", expect.any(String));
    expect(textarea).toBeDisabled();
    resolveOptimize("优化后的提示词");

    await waitFor(() => expect(textarea.value).toBe("优化后的提示词"));
    expect(textarea).not.toBeDisabled();
    expect(textarea).toHaveFocus();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("提示词优化进行中应向辅助技术公告状态", () => {
    setup({ onOptimizePrompt: vi.fn().mockReturnValue(new Promise(() => {})) });
    const textarea = screen.getByTestId("chat-textarea");
    fireEvent.change(textarea, { target: { value: "原始提示词" } });
    fireEvent.click(screen.getByTestId("chat-optimize-prompt"));

    expect(screen.getByRole("status")).toHaveTextContent(t("agent:chat_prompt_optimizing"));
  });

  it("组件卸载时应取消尚未完成的提示词优化", () => {
    const onCancelOptimizePrompt = vi.fn();
    const { unmount } = render(
      <ChatInput
        models={[model("gpt-4o")]}
        selectedModelId="gpt-4o"
        onModelChange={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        onOptimizePrompt={vi.fn().mockReturnValue(new Promise(() => {}))}
        onCancelOptimizePrompt={onCancelOptimizePrompt}
      />
    );
    fireEvent.change(screen.getByTestId("chat-textarea"), { target: { value: "原始提示词" } });
    fireEvent.click(screen.getByTestId("chat-optimize-prompt"));

    unmount();

    expect(onCancelOptimizePrompt).toHaveBeenCalledWith(expect.any(String));
  });

  it("StrictMode 下优化完成后仍应写回并恢复输入框", async () => {
    render(
      <StrictMode>
        <ChatInput
          models={[model("gpt-4o")]}
          selectedModelId="gpt-4o"
          onModelChange={vi.fn()}
          onSend={vi.fn()}
          onStop={vi.fn()}
          isStreaming={false}
          onOptimizePrompt={vi.fn().mockResolvedValue("优化后的提示词")}
        />
      </StrictMode>
    );
    const textarea = screen.getByTestId("chat-textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "原始提示词" } });
    fireEvent.click(screen.getByTestId("chat-optimize-prompt"));

    await waitFor(() => expect(textarea.value).toBe("优化后的提示词"));
    expect(textarea).not.toBeDisabled();
    expect(textarea).toHaveFocus();
  });

  it("空输入时禁用提示词优化按钮", () => {
    setup({ onOptimizePrompt: vi.fn() });
    expect(screen.getByTestId("chat-optimize-prompt")).toBeDisabled();
  });

  it("提示词优化失败时保留原输入并恢复控件", async () => {
    setup({ onOptimizePrompt: vi.fn().mockRejectedValue(new Error("API unavailable")) });
    const textarea = screen.getByTestId("chat-textarea") as HTMLTextAreaElement;
    const optimizeButton = screen.getByTestId("chat-optimize-prompt");
    fireEvent.change(textarea, { target: { value: "原始提示词" } });
    fireEvent.click(optimizeButton);

    await waitFor(() => expect(optimizeButton).not.toBeDisabled());
    expect(textarea.value).toBe("原始提示词");
  });
});
