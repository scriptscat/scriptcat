import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { InstallSuccessRibbon } from "./InstallSuccessRibbon";

beforeAll(() => initTestLanguage("zh-CN"));

afterEach(cleanup);

describe("InstallSuccessRibbon 安装成功条", () => {
  it("展示已安装的脚本名、版本与启用状态", () => {
    render(<InstallSuccessRibbon name="全网每日签到助手" version="2.3.1" enabled kind="install" onClose={vi.fn()} />);
    const ribbon = screen.getByTestId("install-success-ribbon");
    expect(ribbon).toHaveTextContent("已安装");
    expect(ribbon).toHaveTextContent("全网每日签到助手");
    expect(ribbon).toHaveTextContent("v2.3.1");
    expect(ribbon).toHaveTextContent("已启用");
  });

  it("脚本被停用时明示已停用,而不是沉默", () => {
    render(<InstallSuccessRibbon name="脚本" enabled={false} kind="install" onClose={vi.fn()} />);
    expect(screen.getByTestId("install-success-ribbon")).toHaveTextContent("已停用");
  });

  it("更新态与订阅态各自使用对应文案", () => {
    const { rerender } = render(<InstallSuccessRibbon name="脚本" kind="update" onClose={vi.fn()} />);
    expect(screen.getByTestId("install-success-ribbon")).toHaveTextContent("已更新");
    rerender(<InstallSuccessRibbon name="订阅" kind="subscribe" onClose={vi.fn()} />);
    expect(screen.getByTestId("install-success-ribbon")).toHaveTextContent("已订阅");
  });

  it("提供编辑器入口时可点击打开,未提供时不渲染该按钮", () => {
    const onOpenEditor = vi.fn();
    const { rerender } = render(
      <InstallSuccessRibbon name="脚本" kind="install" onOpenEditor={onOpenEditor} onClose={vi.fn()} />
    );
    fireEvent.click(screen.getByTestId("install-success-open-editor"));
    expect(onOpenEditor).toHaveBeenCalledTimes(1);

    rerender(<InstallSuccessRibbon name="脚本" kind="install" onClose={vi.fn()} />);
    expect(screen.queryByTestId("install-success-open-editor")).not.toBeInTheDocument();
  });

  it("点击关闭触发关闭回调", () => {
    const onClose = vi.fn();
    render(<InstallSuccessRibbon name="脚本" kind="install" onClose={onClose} />);
    fireEvent.click(screen.getByTestId("install-success-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
