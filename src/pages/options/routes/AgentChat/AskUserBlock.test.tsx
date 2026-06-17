import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { initLanguage } from "@App/locales/locales";
import AskUserBlock from "./AskUserBlock";

beforeEach(() => initLanguage("zh-CN"));
afterEach(() => cleanup());

describe("用户提问块 AskUserBlock", () => {
  it("展示问题文本", () => {
    render(<AskUserBlock id="q1" question="选择一个颜色" onRespond={vi.fn()} />);
    expect(screen.getByText("选择一个颜色")).toBeInTheDocument();
  });

  it("单选点击选项后立即提交该选项", () => {
    const onRespond = vi.fn();
    render(<AskUserBlock id="q1" question="颜色?" options={["红", "蓝"]} onRespond={onRespond} />);
    fireEvent.click(screen.getByTestId("ask-option-红"));
    expect(onRespond).toHaveBeenCalledWith("q1", "红");
  });

  it("多选切换并确认后提交 JSON 数组", () => {
    const onRespond = vi.fn();
    render(<AskUserBlock id="q1" question="颜色?" options={["红", "蓝", "绿"]} multiple onRespond={onRespond} />);
    fireEvent.click(screen.getByTestId("ask-option-红"));
    fireEvent.click(screen.getByTestId("ask-option-绿"));
    fireEvent.click(screen.getByTestId("ask-confirm"));
    expect(onRespond).toHaveBeenCalledWith("q1", JSON.stringify(["红", "绿"]));
  });

  it("文本输入后发送提交输入内容", () => {
    const onRespond = vi.fn();
    render(<AskUserBlock id="q1" question="随便说点?" onRespond={onRespond} />);
    fireEvent.change(screen.getByTestId("ask-input"), { target: { value: "你好" } });
    fireEvent.click(screen.getByTestId("ask-send"));
    expect(onRespond).toHaveBeenCalledWith("q1", "你好");
  });

  it("提交后进入已回答状态且不再展示输入框", () => {
    const onRespond = vi.fn();
    render(<AskUserBlock id="q1" question="颜色?" options={["红"]} onRespond={onRespond} />);
    fireEvent.click(screen.getByTestId("ask-option-红"));
    expect(screen.queryByTestId("ask-input")).toBeNull();
    expect(screen.getByText("红")).toBeInTheDocument();
  });
});
