import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { InstallErrorBar } from "./InstallErrorBar";

beforeAll(() => initTestLanguage("zh-CN"));

afterEach(cleanup);

describe("InstallErrorBar 安装失败错误条", () => {
  it("常驻展示失败标题与具体原因", () => {
    render(<InstallErrorBar message="网络中断" onRetry={vi.fn()} />);
    const bar = screen.getByTestId("install-error-bar");
    expect(bar).toHaveTextContent("安装失败");
    expect(screen.getByTestId("install-error-bar-message")).toHaveTextContent("网络中断");
  });

  it("提供重试按钮,点击触发重试", () => {
    const onRetry = vi.fn();
    render(<InstallErrorBar message="网络中断" onRetry={onRetry} />);
    fireEvent.click(screen.getByTestId("install-error-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("没有可重放的动作时不展示重试按钮", () => {
    render(<InstallErrorBar message="操作已过期" />);
    expect(screen.queryByTestId("install-error-retry")).toBeNull();
  });

  it("以 alert 角色暴露,读屏用户能立刻收到失败", () => {
    render(<InstallErrorBar message="网络中断" onRetry={vi.fn()} />);
    expect(screen.getByRole("alert")).toBe(screen.getByTestId("install-error-bar"));
  });
});
