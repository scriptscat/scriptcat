import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { act, render, screen, cleanup, fireEvent } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { BackgroundPrompt, backgroundPromptShownKey, keepAlivePromptShownKey } from "./BackgroundPrompt";

const { set } = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock("@App/pages/store/global", () => ({ systemConfig: { set } }));

beforeAll(() => initTestLanguage("zh-CN"));

afterEach(() => {
  cleanup();
  localStorage.clear();
  set.mockReset();
  vi.restoreAllMocks();
});

describe("BackgroundPrompt 后台权限弹窗", () => {
  it("open 时渲染标题、说明与按钮", () => {
    render(<BackgroundPrompt open scriptType="后台脚本" onResult={() => {}} />);
    expect(screen.getByText("是否开启后台运行？")).toBeInTheDocument();
    expect(screen.getByText("立即启用").closest("button")).toBeInTheDocument();
    expect(screen.getByText("暂不启用").closest("button")).toBeInTheDocument();
  });

  it("点击立即启用请求 background 权限并回调结果,记录已展示", async () => {
    const req = vi.spyOn(chrome.permissions, "request");
    const onResult = vi.fn();
    render(<BackgroundPrompt open scriptType="后台脚本" onResult={onResult} />);
    await act(async () => fireEvent.click(screen.getByText("立即启用").closest("button")!));
    expect(onResult).toHaveBeenCalledWith(true);
    expect(req).toHaveBeenCalledWith({ permissions: ["background"] });
    expect(localStorage.getItem(backgroundPromptShownKey)).toBe("true");
  });

  it("传入 webRequestBlocking 时请求保活权限并使用独立展示标记", async () => {
    const req = vi.spyOn(chrome.permissions, "request");
    const onResult = vi.fn();
    render(<BackgroundPrompt open scriptType="定时脚本" permission="webRequestBlocking" onResult={onResult} />);
    await act(async () => fireEvent.click(screen.getByText("立即启用").closest("button")!));
    expect(onResult).toHaveBeenCalledWith(true);
    expect(req).toHaveBeenCalledWith({ permissions: ["webRequestBlocking"] });
    expect(set).toHaveBeenCalledWith("keep_ext_background_alive", true);
    expect(localStorage.getItem(keepAlivePromptShownKey)).toBe("true");
    expect(localStorage.getItem(backgroundPromptShownKey)).toBeNull();
  });

  it("点击暂不启用回调 false 且记录已展示", () => {
    const onResult = vi.fn();
    render(<BackgroundPrompt open scriptType="后台脚本" onResult={onResult} />);
    fireEvent.click(screen.getByText("暂不启用").closest("button")!);
    expect(onResult).toHaveBeenCalledWith(false);
    expect(localStorage.getItem(backgroundPromptShownKey)).toBe("true");
  });

  it("open 为 false 时不渲染对话框", () => {
    render(<BackgroundPrompt open={false} scriptType="后台脚本" onResult={() => {}} />);
    expect(screen.queryByText("是否开启后台运行？")).not.toBeInTheDocument();
  });
});
