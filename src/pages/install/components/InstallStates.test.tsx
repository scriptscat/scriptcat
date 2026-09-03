import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { t } from "@App/locales/locales";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { InstallLoading, InstallError, InstallExpired } from "./InstallStates";

beforeAll(() => initTestLanguage("zh-CN"));

afterEach(cleanup);

describe("InstallLoading 加载中状态屏", () => {
  it("渲染加载标题、来源与字节进度文案", () => {
    render(<InstallLoading source="example.com" bytesText="正在下载。已接收 12 KB。" />);
    expect(screen.getByText("正在加载脚本")).toBeInTheDocument();
    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.getByText("正在下载。已接收 12 KB。")).toBeInTheDocument();
  });

  it("保留顶部品牌栏(对照设计稿,加载态不丢失外壳)", () => {
    render(<InstallLoading source="example.com" />);
    expect(screen.getByTestId("install-top-bar")).toBeInTheDocument();
  });

  it("提供 percent 时渲染确定进度条且宽度反映百分比", () => {
    render(<InstallLoading bytesText="正在下载。已接收 512.00 B / 1.00 KB(50%)。" percent={50} />);
    const bar = screen.getByTestId("install-progress");
    expect(bar).toHaveStyle({ width: "50%" });
  });

  it("未提供 percent 时不渲染确定进度条(保持不确定动画条)", () => {
    render(<InstallLoading bytesText="正在下载。已接收 12 KB。" />);
    expect(screen.queryByTestId("install-progress")).not.toBeInTheDocument();
  });
});

describe("InstallError 加载失败状态屏", () => {
  it("渲染标题与错误信息", () => {
    render(<InstallError message="Error: Fetch failed with status 404" onClose={() => {}} />);
    expect(screen.getByText("安装页面加载失败")).toBeInTheDocument();
    expect(screen.getByText("Error: Fetch failed with status 404")).toBeInTheDocument();
  });

  it("提供重试和自定义标题时可分别触发重试与关闭", () => {
    const onRetry = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(<InstallError title="无效安装地址" message="x" onRetry={onRetry} onClose={onClose} />);

    expect(screen.getByText("无效安装地址")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();

    rerender(<InstallError title="无效安装地址" message="x" onClose={onClose} />);
    expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument();
  });

  it("保留顶部品牌栏(对照设计稿,失败态不丢失外壳)", () => {
    render(<InstallError message="x" onClose={() => {}} />);
    expect(screen.getByTestId("install-top-bar")).toBeInTheDocument();
  });
});

describe("InstallStates 加载态的上下文与占位", () => {
  it("未确知场景时不渲染上下文 chip,不猜成「脚本安装」", () => {
    render(<InstallLoading />);

    expect(screen.queryByText(t("install:context_install"))).toBeNull();
    expect(screen.queryByText(t("install:context_update"))).toBeNull();
  });

  it("更新场景显示「脚本更新」与对应文案", () => {
    render(<InstallLoading mode="update" />);

    expect(screen.getByText(t("install:context_update"))).toBeTruthy();
    expect(screen.getByText(t("install:loading_title_update"))).toBeTruthy();
    expect(screen.getByText(t("install:loading_desc_prepare_update"))).toBeTruthy();
  });

  it("只有真的在下载时才说「正在下载」", () => {
    render(<InstallLoading mode="update" source="example.com" />);

    expect(screen.getByText(t("install:loading_desc"))).toBeTruthy();
  });

  it("状态屏保留与就绪态操作栏等高的底部占位,避免就绪瞬间再跳一次", () => {
    render(<InstallLoading />);

    expect(screen.getByTestId("state-action-placeholder")).toBeTruthy();
  });
});

describe("InstallStates 代码已过期", () => {
  it("给出过期专属文案与重新检查出口,而不是必然再失败的重试", () => {
    const onRecheck = vi.fn();
    const onClose = vi.fn();
    render(<InstallExpired onRecheck={onRecheck} onClose={onClose} />);

    expect(screen.getByTestId("install-expired")).toBeTruthy();
    expect(screen.getByText(t("install:expired_title"))).toBeTruthy();
    expect(screen.queryByText(t("install:error_retry"))).toBeNull();

    fireEvent.click(screen.getByText(t("install:expired_recheck")));
    expect(onRecheck).toHaveBeenCalledTimes(1);
  });
});
