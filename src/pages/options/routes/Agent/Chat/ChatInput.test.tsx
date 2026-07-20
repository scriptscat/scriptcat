import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { t } from "@App/locales/locales";
import { initTestLanguage } from "@Tests/initTestLanguage";
import type { AgentModelConfig, SkillSummary } from "@App/app/service/agent/core/types";
import { notify } from "@App/pages/components/ui/toast";
import ChatInput from "./ChatInput";

vi.mock("@App/pages/components/ui/toast", () => ({
  notify: { error: vi.fn(), info: vi.fn() },
}));

beforeAll(() => initTestLanguage("zh-CN"));
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
  it("输入文本点击发送触发 onSend 并清空输入", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    setup({ onSend });
    const ta = screen.getByTestId("chat-textarea") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "  你好  " } });
    fireEvent.click(screen.getByTestId("chat-send"));
    expect(onSend).toHaveBeenCalledWith("你好");
    await waitFor(() => expect(ta.value).toBe(""));
  });

  it("空输入时不触发发送", () => {
    const onSend = vi.fn();
    setup({ onSend });
    fireEvent.click(screen.getByTestId("chat-send"));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("Enter 发送，Shift+Enter 不发送", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    setup({ onSend });
    const ta = screen.getByTestId("chat-textarea");
    fireEvent.change(ta, { target: { value: "发我" } });
    fireEvent.keyDown(ta, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(ta, { key: "Enter" });
    await waitFor(() => expect(onSend).toHaveBeenCalledWith("发我"));
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

  it("发送失败时应提示错误并保留文本与附件草稿", async () => {
    const onSend = vi.fn().mockRejectedValue(new Error("storage unavailable"));
    setup({ onSend });
    const ta = screen.getByTestId("chat-textarea") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "draft" } });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(["file"], "draft.txt", { type: "text/plain" })] },
    });

    fireEvent.click(screen.getByTestId("chat-send"));

    await waitFor(() => expect(notify.error).toHaveBeenCalledWith(expect.stringContaining("storage unavailable")));
    expect(ta.value).toBe("draft");
    expect(screen.getByTitle("draft.txt")).toBeInTheDocument();
  });

  it("选中图片附件后卸载组件应 revoke 对应的预览 URL，而不是卸载时的初始空数组", () => {
    const createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-preview");
    const revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const props: React.ComponentProps<typeof ChatInput> = {
      models: [model("gpt-4o")],
      selectedModelId: "gpt-4o",
      onModelChange: vi.fn(),
      onSend: vi.fn(),
      onStop: vi.fn(),
      isStreaming: false,
    };
    const { unmount } = render(<ChatInput {...props} />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(["img"], "pic.png", { type: "image/png" })] },
    });
    expect(createObjectURLSpy).toHaveBeenCalled();

    unmount();

    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:mock-preview");

    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });
});
