import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { initLanguage } from "@App/locales/locales";
import { InstallLoading, InstallError } from "./InstallStates";

afterEach(cleanup);

describe("InstallLoading 加载中状态屏", () => {
  it("渲染加载标题、来源与字节进度文案", () => {
    initLanguage("zh-CN");
    render(<InstallLoading source="example.com" bytesText="正在下载。已接收 12 KB。" />);
    expect(screen.getByText("正在加载脚本")).toBeInTheDocument();
    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.getByText("正在下载。已接收 12 KB。")).toBeInTheDocument();
  });

  it("保留顶部品牌栏(对照设计稿,加载态不丢失外壳)", () => {
    initLanguage("zh-CN");
    render(<InstallLoading source="example.com" />);
    expect(screen.getByTestId("install-top-bar")).toBeInTheDocument();
  });

  it("提供 percent 时渲染确定进度条且宽度反映百分比", () => {
    initLanguage("zh-CN");
    render(<InstallLoading bytesText="正在下载。已接收 512.00 B / 1.00 KB(50%)。" percent={50} />);
    const bar = screen.getByTestId("install-progress");
    expect(bar).toHaveStyle({ width: "50%" });
  });

  it("未提供 percent 时不渲染确定进度条(保持不确定动画条)", () => {
    initLanguage("zh-CN");
    render(<InstallLoading bytesText="正在下载。已接收 12 KB。" />);
    expect(screen.queryByTestId("install-progress")).not.toBeInTheDocument();
  });
});

describe("InstallError 加载失败状态屏", () => {
  it("渲染标题与错误信息", () => {
    initLanguage("zh-CN");
    render(<InstallError message="Error: Fetch failed with status 404" onClose={() => {}} />);
    expect(screen.getByText("安装页面加载失败")).toBeInTheDocument();
    expect(screen.getByText("Error: Fetch failed with status 404")).toBeInTheDocument();
  });

  it("保留顶部品牌栏(对照设计稿,失败态不丢失外壳)", () => {
    initLanguage("zh-CN");
    render(<InstallError message="x" onClose={() => {}} />);
    expect(screen.getByTestId("install-top-bar")).toBeInTheDocument();
  });

  it("提供 onRetry 时渲染重试按钮并可点击", () => {
    initLanguage("zh-CN");
    const onRetry = vi.fn();
    render(<InstallError message="x" onRetry={onRetry} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("未提供 onRetry 时不渲染重试按钮", () => {
    initLanguage("zh-CN");
    render(<InstallError message="x" onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument();
  });

  it("点击关闭触发 onClose", () => {
    initLanguage("zh-CN");
    const onClose = vi.fn();
    render(<InstallError message="x" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("可自定义标题(用于无效页面)", () => {
    initLanguage("zh-CN");
    render(<InstallError title="无效页面" message="缺少参数" onClose={() => {}} />);
    expect(screen.getByText("无效页面")).toBeInTheDocument();
  });
});
