import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { InstallActions } from "./InstallActions";

const baseProps = () => ({
  placement: "footer" as const,
  isUpdate: false,
  isSubscribe: false,
  onInstall: vi.fn(),
  onClose: vi.fn(),
  onToggleWatch: vi.fn(),
});

const open = async (el: HTMLElement) => {
  await act(async () => {
    fireEvent.click(el);
  });
};

beforeAll(() => initTestLanguage("zh-CN"));

afterEach(cleanup);

describe("InstallActions 操作区", () => {
  it("点击主按钮触发安装", () => {
    const p = baseProps();
    render(<InstallActions {...p} />);
    fireEvent.click(screen.getByTestId("install-primary"));
    expect(p.onInstall).toHaveBeenCalledTimes(1);
  });

  it("primaryDisabled 时主按钮禁用", () => {
    render(<InstallActions {...baseProps()} primaryDisabled />);
    expect(screen.getByTestId("install-primary")).toBeDisabled();
  });

  it("展开更多菜单可选择不关闭窗口", async () => {
    const p = baseProps();
    render(<InstallActions {...p} />);
    await open(screen.getByTestId("install-more"));
    fireEvent.click(screen.getByText(/不关闭窗口/).closest('[role="menuitem"]')!);
    expect(p.onInstall).toHaveBeenCalledWith({ closeAfterInstall: false });
  });

  it("非订阅展开菜单含禁止更新项并可点击", async () => {
    const p = baseProps();
    render(<InstallActions {...p} />);
    await open(screen.getByTestId("install-more"));
    fireEvent.click(screen.getByText(/不再检查更新/).closest('[role="menuitem"]')!);
    expect(p.onInstall).toHaveBeenCalledWith({ noMoreUpdates: true });
  });

  it("订阅源隐藏禁止更新项", async () => {
    render(<InstallActions {...baseProps()} isSubscribe />);
    await open(screen.getByTestId("install-more"));
    expect(screen.queryByText(/不再检查更新/)).not.toBeInTheDocument();
  });

  it("全新安装关闭为普通按钮并触发关闭", () => {
    const p = baseProps();
    render(<InstallActions {...p} />);
    fireEvent.click(screen.getByTestId("close-primary"));
    expect(p.onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("close-more")).not.toBeInTheDocument();
  });

  it("更新态关闭可选择不再检查更新", async () => {
    const p = baseProps();
    render(<InstallActions {...p} isUpdate />);
    await open(screen.getByTestId("close-more"));
    fireEvent.click(screen.getByText(/不再检查更新/).closest('[role="menuitem"]')!);
    expect(p.onClose).toHaveBeenCalledWith({ noMoreUpdates: true });
  });

  it("本地文件显示监听按钮,点击切换监听", () => {
    const p = baseProps();
    render(<InstallActions {...p} localFile />);
    fireEvent.click(screen.getByTestId("watch-toggle"));
    expect(p.onToggleWatch).toHaveBeenCalledTimes(1);
  });

  it("监听中显示停止监听文案", () => {
    render(<InstallActions {...baseProps()} localFile watching />);
    expect(screen.getByTestId("watch-toggle")).toHaveTextContent("停止监听");
  });

  it("未提供 onExternalAccessReject 时不渲染拒绝按钮", () => {
    render(<InstallActions {...baseProps()} />);
    expect(screen.queryByTestId("external-access-reject")).not.toBeInTheDocument();
  });

  it("提供 onExternalAccessReject 时渲染拒绝按钮，点击触发回调（MCP 请求安装流程）", () => {
    const onExternalAccessReject = vi.fn();
    render(<InstallActions {...baseProps()} onExternalAccessReject={onExternalAccessReject} />);
    const rejectButton = screen.getByTestId("external-access-reject");
    expect(rejectButton).toBeInTheDocument();
    fireEvent.click(rejectButton);
    expect(onExternalAccessReject).toHaveBeenCalledTimes(1);
  });

  it("外部接入更新时「本会话允许」不再是独立按钮，而是主按钮下拉的首项，选中触发会话允许", async () => {
    const p = baseProps();
    const onExternalAccessSessionAllow = vi.fn();
    render(
      <InstallActions
        {...p}
        isUpdate
        onExternalAccessReject={vi.fn()}
        onExternalAccessSessionAllow={onExternalAccessSessionAllow}
      />
    );
    expect(screen.queryByTestId("external-access-session-allow")).not.toBeInTheDocument();
    await open(screen.getByTestId("install-more"));
    const items = screen.getAllByRole("menuitem");
    expect(items[0]).toHaveTextContent("更新并本会话允许");
    fireEvent.click(items[0]);
    expect(onExternalAccessSessionAllow).toHaveBeenCalledTimes(1);
    expect(p.onInstall).not.toHaveBeenCalled();
  });

  it("未提供会话允许回调时下拉不含「更新并本会话允许」", async () => {
    render(<InstallActions {...baseProps()} isUpdate onExternalAccessReject={vi.fn()} />);
    await open(screen.getByTestId("install-more"));
    expect(screen.queryByText("更新并本会话允许")).not.toBeInTheDocument();
  });
});

describe("InstallActions 按位置渲染", () => {
  it("身份卡内整组按钮放大一号，吸底栏保持常规尺寸", () => {
    const { unmount } = render(<InstallActions {...baseProps()} placement="card" />);
    expect(screen.getByTestId("install-primary")).toHaveAttribute("data-size", "lg");
    expect(screen.getByTestId("close-primary")).toHaveAttribute("data-size", "lg");
    unmount();
    render(<InstallActions {...baseProps()} placement="sticky" />);
    expect(screen.getByTestId("install-primary")).toHaveAttribute("data-size", "default");
  });

  it("外部接入的拒绝按钮在首屏获得焦点，滚动中途出现的吸底副本不抢焦点", () => {
    const { unmount } = render(<InstallActions {...baseProps()} placement="card" onExternalAccessReject={vi.fn()} />);
    expect(screen.getByTestId("external-access-reject")).toHaveFocus();
    unmount();
    render(<InstallActions {...baseProps()} placement="sticky" onExternalAccessReject={vi.fn()} />);
    expect(screen.getByTestId("external-access-reject")).not.toHaveFocus();
  });
});

describe("InstallActions 主按钮就地状态机", () => {
  it("安装中:主按钮显示进行中文案并禁用,连同拆分菜单一起锁住", () => {
    render(<InstallActions {...baseProps()} phase="installing" />);
    const primary = screen.getByTestId("install-primary");
    expect(primary).toHaveTextContent("安装中");
    expect(primary).toBeDisabled();
    expect(screen.getByTestId("install-more")).toBeDisabled();
  });

  it("已安装:主按钮转为已安装且保持禁用,避免重复点击", () => {
    render(<InstallActions {...baseProps()} phase="installed" />);
    const primary = screen.getByTestId("install-primary");
    expect(primary).toHaveTextContent("已安装");
    expect(primary).toBeDisabled();
  });

  it("失败:主按钮回到可点状态并改为重试安装", () => {
    const p = baseProps();
    render(<InstallActions {...p} phase="failed" />);
    const primary = screen.getByTestId("install-primary");
    expect(primary).toHaveTextContent("重试安装");
    expect(primary).not.toBeDisabled();
    fireEvent.click(primary);
    expect(p.onInstall).toHaveBeenCalledTimes(1);
  });

  it("外部接入的决策按钮在安装完成后锁住,避免在已批准后再提交拒绝", () => {
    render(
      <InstallActions
        {...baseProps()}
        isUpdate
        phase="installed"
        onExternalAccessReject={vi.fn()}
        onExternalAccessSessionAllow={vi.fn()}
      />
    );
    expect(screen.getByTestId("external-access-reject")).toBeDisabled();
    // 本会话允许位于主按钮下拉中，下拉触发器锁住即该入口锁住
    expect(screen.getByTestId("install-more")).toBeDisabled();
  });

  it("未传 phase 时保持原有的安装文案与可点状态", () => {
    render(<InstallActions {...baseProps()} />);
    const primary = screen.getByTestId("install-primary");
    expect(primary).toHaveTextContent("安装");
    expect(primary).not.toBeDisabled();
  });
});
