// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { initLanguage } from "@App/locales/locales";
import { InstallActions } from "./InstallActions";

const baseProps = () => ({
  isUpdate: false,
  isSubscribe: false,
  onInstall: vi.fn(),
  onClose: vi.fn(),
  onToggleWatch: vi.fn(),
});

// jsdom 缺 scrollIntoView,Radix 展开后聚焦菜单项会用到,先补桩
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
const open = async (el: HTMLElement) => {
  await act(async () => {
    fireEvent.click(el);
  });
};

afterEach(cleanup);

describe("InstallActions 操作区", () => {
  it("点击主按钮触发安装", () => {
    initLanguage("zh-CN");
    const p = baseProps();
    render(<InstallActions {...p} />);
    fireEvent.click(screen.getByTestId("install-primary"));
    expect(p.onInstall).toHaveBeenCalledTimes(1);
  });

  it("primaryDisabled 时主按钮禁用", () => {
    initLanguage("zh-CN");
    render(<InstallActions {...baseProps()} primaryDisabled />);
    expect(screen.getByTestId("install-primary")).toBeDisabled();
  });

  it("展开更多菜单可选择不关闭窗口", async () => {
    initLanguage("zh-CN");
    const p = baseProps();
    render(<InstallActions {...p} />);
    await open(screen.getByTestId("install-more"));
    fireEvent.click(screen.getByRole("menuitem", { name: /不关闭窗口/ }));
    expect(p.onInstall).toHaveBeenCalledWith({ closeAfterInstall: false });
  });

  it("非订阅展开菜单含禁止更新项并可点击", async () => {
    initLanguage("zh-CN");
    const p = baseProps();
    render(<InstallActions {...p} />);
    await open(screen.getByTestId("install-more"));
    fireEvent.click(screen.getByRole("menuitem", { name: /不再检查更新/ }));
    expect(p.onInstall).toHaveBeenCalledWith({ noMoreUpdates: true });
  });

  it("订阅源隐藏禁止更新项", async () => {
    initLanguage("zh-CN");
    render(<InstallActions {...baseProps()} isSubscribe />);
    await open(screen.getByTestId("install-more"));
    expect(screen.queryByRole("menuitem", { name: /不再检查更新/ })).not.toBeInTheDocument();
  });

  it("全新安装关闭为普通按钮并触发关闭", () => {
    initLanguage("zh-CN");
    const p = baseProps();
    render(<InstallActions {...p} />);
    fireEvent.click(screen.getByTestId("close-primary"));
    expect(p.onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("close-more")).not.toBeInTheDocument();
  });

  it("更新态关闭可选择不再检查更新", async () => {
    initLanguage("zh-CN");
    const p = baseProps();
    render(<InstallActions {...p} isUpdate />);
    await open(screen.getByTestId("close-more"));
    fireEvent.click(screen.getByRole("menuitem", { name: /不再检查更新/ }));
    expect(p.onClose).toHaveBeenCalledWith({ noMoreUpdates: true });
  });

  it("本地文件显示监听按钮,点击切换监听", () => {
    initLanguage("zh-CN");
    const p = baseProps();
    render(<InstallActions {...p} localFile />);
    fireEvent.click(screen.getByTestId("watch-toggle"));
    expect(p.onToggleWatch).toHaveBeenCalledTimes(1);
  });

  it("监听中显示停止监听文案", () => {
    initLanguage("zh-CN");
    render(<InstallActions {...baseProps()} localFile watching />);
    expect(screen.getByTestId("watch-toggle")).toHaveTextContent("停止监听");
  });

  it("操作栏左侧渲染信任提示语(对照设计稿 BarNote)", () => {
    initLanguage("zh-CN");
    render(<InstallActions {...baseProps()} />);
    expect(screen.getByTestId("action-bar-note")).toBeInTheDocument();
  });
});
