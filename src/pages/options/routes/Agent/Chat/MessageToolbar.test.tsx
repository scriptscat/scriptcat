import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { t } from "@App/locales/locales";
import { initTestLanguage } from "@Tests/initTestLanguage";
import MessageToolbar, { type MessageToolbarProps } from "./MessageToolbar";

beforeAll(() => initTestLanguage("zh-CN"));
afterEach(() => cleanup());

const baseProps = (over?: Partial<MessageToolbarProps>): MessageToolbarProps => ({
  toolCallCount: 0,
  onCopy: vi.fn(),
  onRegenerate: vi.fn(),
  onDelete: vi.fn(),
  ...over,
});

describe("消息工具栏 MessageToolbar", () => {
  it("点击复制/重新生成触发对应回调", () => {
    const onCopy = vi.fn();
    const onRegenerate = vi.fn();
    render(<MessageToolbar {...baseProps({ onCopy, onRegenerate })} />);
    fireEvent.click(screen.getByTestId("toolbar-copy"));
    fireEvent.click(screen.getByTestId("toolbar-regenerate"));
    expect(onCopy).toHaveBeenCalledOnce();
    expect(onRegenerate).toHaveBeenCalledOnce();
  });

  it("确认气泡确认后才触发删除", async () => {
    const onDelete = vi.fn();
    render(<MessageToolbar {...baseProps({ onDelete })} />);
    fireEvent.click(screen.getByTestId("toolbar-delete"));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByText(t("common:confirm"), { selector: "button" }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("展示 token 用量与耗时", () => {
    render(<MessageToolbar {...baseProps({ usage: { inputTokens: 1500, outputTokens: 800 }, durationMs: 2500 })} />);
    expect(screen.getByTestId("toolbar-meta").textContent).toContain("1.5k");
    expect(screen.getByTestId("toolbar-meta").textContent).toContain("800");
    expect(screen.getByTestId("toolbar-meta").textContent).toContain("2.5s");
  });

  it("有工具调用时展示工具数量", () => {
    render(<MessageToolbar {...baseProps({ toolCallCount: 3 })} />);
    expect(screen.getByTestId("toolbar-meta").textContent).toContain("3");
  });
});
