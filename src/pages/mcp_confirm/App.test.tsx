import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";

const { getOperation, decideOperation, findInfo } = vi.hoisted(() => ({
  getOperation: vi.fn(),
  decideOperation: vi.fn(),
  findInfo: vi.fn(),
}));
vi.mock("@App/pages/store/features/script", () => ({
  mcpClient: { getOperation, decideOperation },
  scriptClient: { findInfo },
}));

import { McpConfirmView } from "./App";

const baseOp = (over: Record<string, unknown> = {}) => ({
  operationId: "op-1",
  kind: "enable",
  status: "awaiting_user",
  targetUuid: "script-uuid-1",
  requestingClientName: "Claude Desktop",
  ...over,
});

beforeAll(() => initTestLanguage("zh-CN"));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, "close").mockImplementation(() => {});
  decideOperation.mockResolvedValue(undefined);
  findInfo.mockResolvedValue({ uuid: "script-uuid-1", name: "自动签到脚本" });
});
afterEach(() => {
  cleanup();
});

describe("MCP 操作确认页", () => {
  it("加载中的挂起操作应展示脚本名称与请求方", async () => {
    getOperation.mockResolvedValue(baseOp());
    render(<McpConfirmView operationId="op-1" />);
    expect(await screen.findByTestId("mcp-confirm-card")).toBeInTheDocument();
    expect(screen.getByText("自动签到脚本")).toBeInTheDocument();
    expect(screen.getByText(/Claude Desktop/)).toBeInTheDocument();
  });

  it("操作不存在或已过期时展示过期提示，而非确认卡片", async () => {
    getOperation.mockResolvedValue(undefined);
    render(<McpConfirmView operationId="op-1" />);
    expect(await screen.findByTestId("mcp-confirm-expired")).toBeInTheDocument();
    expect(screen.queryByTestId("mcp-confirm-card")).not.toBeInTheDocument();
  });

  it("状态非 awaiting_user 时视为过期（已被决定或已取消）", async () => {
    getOperation.mockResolvedValue(baseOp({ status: "approved" }));
    render(<McpConfirmView operationId="op-1" />);
    expect(await screen.findByTestId("mcp-confirm-expired")).toBeInTheDocument();
  });

  it("enable 操作点击批准后调用 decideOperation({approved:true, enable:true}) 并关闭窗口", async () => {
    getOperation.mockResolvedValue(baseOp({ kind: "enable" }));
    render(<McpConfirmView operationId="op-1" />);
    fireEvent.click(await screen.findByTestId("mcp-confirm-approve"));
    await waitFor(() =>
      expect(decideOperation).toHaveBeenCalledWith({ operationId: "op-1", approved: true, enable: true })
    );
    expect(window.close).toHaveBeenCalledTimes(1);
  });

  it("disable 操作点击批准后 enable 参数为 false", async () => {
    getOperation.mockResolvedValue(baseOp({ kind: "disable" }));
    render(<McpConfirmView operationId="op-1" />);
    fireEvent.click(await screen.findByTestId("mcp-confirm-approve"));
    await waitFor(() =>
      expect(decideOperation).toHaveBeenCalledWith({ operationId: "op-1", approved: true, enable: false })
    );
  });

  it("点击拒绝调用 decideOperation({approved:false}) 并关闭窗口", async () => {
    getOperation.mockResolvedValue(baseOp({ kind: "enable" }));
    render(<McpConfirmView operationId="op-1" />);
    fireEvent.click(await screen.findByTestId("mcp-confirm-reject"));
    await waitFor(() => expect(decideOperation).toHaveBeenCalledWith({ operationId: "op-1", approved: false }));
    expect(window.close).toHaveBeenCalledTimes(1);
  });

  it("delete 操作渲染按住确认按钮而非普通批准按钮", async () => {
    getOperation.mockResolvedValue(baseOp({ kind: "delete" }));
    render(<McpConfirmView operationId="op-1" />);
    expect(await screen.findByTestId("mcp-confirm-hold")).toBeInTheDocument();
    expect(screen.queryByTestId("mcp-confirm-approve")).not.toBeInTheDocument();
  });

  it("按住确认按钮持续按住直至阈值才触发批准（防止误触）", async () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "Date"] });
    getOperation.mockResolvedValue(baseOp({ kind: "delete" }));
    render(<McpConfirmView operationId="op-1" />);
    const holdButton = await screen.findByTestId("mcp-confirm-hold");

    fireEvent.pointerDown(holdButton);
    // 松开过早，不应触发决定
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.pointerUp(holdButton);
    expect(decideOperation).not.toHaveBeenCalled();

    // 重新按住并持续超过阈值
    fireEvent.pointerDown(holdButton);
    await act(async () => {
      vi.advanceTimersByTime(1600);
    });
    expect(decideOperation).toHaveBeenCalledWith({ operationId: "op-1", approved: true });
    vi.useRealTimers();
  });

  it("重复点击批准只触发一次决定（防止双重决定）", async () => {
    getOperation.mockResolvedValue(baseOp({ kind: "enable" }));
    render(<McpConfirmView operationId="op-1" />);
    const approveButton = await screen.findByTestId("mcp-confirm-approve");
    fireEvent.click(approveButton);
    fireEvent.click(approveButton);
    await waitFor(() => expect(decideOperation).toHaveBeenCalledTimes(1));
  });
});
