import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { initLanguage } from "@App/locales/locales";
import { BackgroundPrompt, backgroundPromptShownKey } from "./BackgroundPrompt";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("BackgroundPrompt 后台权限弹窗", () => {
  it("open 时渲染标题、说明与按钮", () => {
    initLanguage("zh-CN");
    render(<BackgroundPrompt open scriptType="后台脚本" onResult={() => {}} />);
    expect(screen.getByText("是否开启后台运行？")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "立即启用" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "暂不启用" })).toBeInTheDocument();
  });

  it("点击立即启用请求 background 权限并回调结果,记录已展示", async () => {
    initLanguage("zh-CN");
    const req = vi.spyOn(chrome.permissions, "request");
    const onResult = vi.fn();
    render(<BackgroundPrompt open scriptType="后台脚本" onResult={onResult} />);
    fireEvent.click(screen.getByRole("button", { name: "立即启用" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
    expect(req).toHaveBeenCalledWith({ permissions: ["background"] });
    expect(localStorage.getItem(backgroundPromptShownKey)).toBe("true");
  });

  it("点击暂不启用回调 false 且记录已展示", () => {
    initLanguage("zh-CN");
    const onResult = vi.fn();
    render(<BackgroundPrompt open scriptType="后台脚本" onResult={onResult} />);
    fireEvent.click(screen.getByRole("button", { name: "暂不启用" }));
    expect(onResult).toHaveBeenCalledWith(false);
    expect(localStorage.getItem(backgroundPromptShownKey)).toBe("true");
  });

  it("open 为 false 时不渲染对话框", () => {
    initLanguage("zh-CN");
    render(<BackgroundPrompt open={false} scriptType="后台脚本" onResult={() => {}} />);
    expect(screen.queryByText("是否开启后台运行？")).not.toBeInTheDocument();
  });
});
