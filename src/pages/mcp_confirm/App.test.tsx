import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";

const { getOperation, decideOperation, findInfo, getPendingPairing, decidePairing } = vi.hoisted(() => ({
  getOperation: vi.fn(),
  decideOperation: vi.fn(),
  findInfo: vi.fn(),
  getPendingPairing: vi.fn(),
  decidePairing: vi.fn(),
}));
vi.mock("@App/pages/store/features/script", () => ({
  mcpClient: { getOperation, decideOperation, getPendingPairing, decidePairing },
  scriptClient: { findInfo },
}));

import { McpConfirmView, McpPairingView } from "./App";

const baseOp = (over: Record<string, unknown> = {}) => ({
  operationId: "op-1",
  kind: "enable",
  status: "awaiting_user",
  targetUuid: "script-uuid-1",
  requestingClientName: "Claude Desktop",
  ...over,
});

beforeAll(() => initTestLanguage("zh-CN"));

const basePairing = (over: Record<string, unknown> = {}) => ({
  pairingId: "pair-1",
  clientName: "Claude Desktop",
  requestedScopes: ["scripts:list", "scripts:metadata:read", "scripts:source:read"],
  code: "ABCD1234",
  expiresAt: Date.now() + 120_000,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, "close").mockImplementation(() => {});
  decideOperation.mockResolvedValue(undefined);
  decidePairing.mockResolvedValue(undefined);
  findInfo.mockResolvedValue({ uuid: "script-uuid-1", name: "自动签到脚本" });
  getPendingPairing.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
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

  it("source_disclosure：渲染 拒绝/仅本次允许/对该客户端始终允许 三个按钮，而非普通批准/拒绝", async () => {
    getOperation.mockResolvedValue(baseOp({ kind: "source_disclosure" }));
    render(<McpConfirmView operationId="op-1" />);
    expect(await screen.findByTestId("mcp-confirm-allow-client")).toBeInTheDocument();
    expect(screen.getByTestId("mcp-confirm-allow-once")).toBeInTheDocument();
    expect(screen.getByTestId("mcp-confirm-reject")).toBeInTheDocument();
    expect(screen.queryByTestId("mcp-confirm-approve")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mcp-confirm-hold")).not.toBeInTheDocument();
  });

  it("source_disclosure：点击「对该客户端始终允许」调用 decideOperation({approved:true, rememberChoice:'client'})", async () => {
    getOperation.mockResolvedValue(baseOp({ kind: "source_disclosure" }));
    render(<McpConfirmView operationId="op-1" />);
    fireEvent.click(await screen.findByTestId("mcp-confirm-allow-client"));
    await waitFor(() =>
      expect(decideOperation).toHaveBeenCalledWith({ operationId: "op-1", approved: true, rememberChoice: "client" })
    );
    expect(window.close).toHaveBeenCalledTimes(1);
  });

  it("source_disclosure：点击「仅本次允许」调用 decideOperation({approved:true, rememberChoice:'once'})", async () => {
    getOperation.mockResolvedValue(baseOp({ kind: "source_disclosure" }));
    render(<McpConfirmView operationId="op-1" />);
    fireEvent.click(await screen.findByTestId("mcp-confirm-allow-once"));
    await waitFor(() =>
      expect(decideOperation).toHaveBeenCalledWith({ operationId: "op-1", approved: true, rememberChoice: "once" })
    );
  });

  it("source_disclosure：点击拒绝调用 decideOperation({approved:false})，不携带 rememberChoice", async () => {
    getOperation.mockResolvedValue(baseOp({ kind: "source_disclosure" }));
    render(<McpConfirmView operationId="op-1" />);
    fireEvent.click(await screen.findByTestId("mcp-confirm-reject"));
    await waitFor(() => expect(decideOperation).toHaveBeenCalledWith({ operationId: "op-1", approved: false }));
  });
});

describe("MCP 配对对话框", () => {
  it("展示客户端名称、验证码，并默认勾选只读 scope、不勾选来源读取 scope", async () => {
    getPendingPairing.mockResolvedValue(basePairing());
    render(<McpPairingView pairingId="pair-1" />);
    expect(await screen.findByTestId("mcp-pairing-card")).toBeInTheDocument();
    expect(screen.getByTestId("mcp-pairing-client-name")).toHaveTextContent("Claude Desktop");
    expect(screen.getByTestId("mcp-pairing-code")).toHaveTextContent("ABCD1234");
    expect(screen.getByTestId("mcp-scope-checkbox-scripts:list")).toHaveAttribute("data-state", "checked");
    expect(screen.getByTestId("mcp-scope-checkbox-scripts:metadata:read")).toHaveAttribute("data-state", "checked");
    expect(screen.getByTestId("mcp-scope-checkbox-scripts:source:read")).toHaveAttribute("data-state", "unchecked");
  });

  it("写 scope（安装/启停/删除）默认不勾选", async () => {
    getPendingPairing.mockResolvedValue(
      basePairing({ requestedScopes: ["scripts:list", "scripts:install:request", "scripts:delete:request"] })
    );
    render(<McpPairingView pairingId="pair-1" />);
    await screen.findByTestId("mcp-pairing-card");
    expect(screen.getByTestId("mcp-scope-checkbox-scripts:install:request")).toHaveAttribute("data-state", "unchecked");
    expect(screen.getByTestId("mcp-scope-checkbox-scripts:delete:request")).toHaveAttribute("data-state", "unchecked");
  });

  it("找不到匹配的待处理配对时展示过期提示", async () => {
    getPendingPairing.mockResolvedValue(undefined);
    render(<McpPairingView pairingId="pair-1" />);
    expect(await screen.findByTestId("mcp-pairing-expired")).toBeInTheDocument();
  });

  it("点击批准调用 decidePairing，携带当前勾选的 scope 列表", async () => {
    getPendingPairing.mockResolvedValue(basePairing({ requestedScopes: ["scripts:list", "scripts:source:read"] }));
    render(<McpPairingView pairingId="pair-1" />);
    fireEvent.click(await screen.findByTestId("mcp-scope-checkbox-scripts:source:read"));
    fireEvent.click(screen.getByTestId("mcp-pairing-approve"));
    await waitFor(() =>
      expect(decidePairing).toHaveBeenCalledWith({
        pairingId: "pair-1",
        approved: true,
        grantedScopes: expect.arrayContaining(["scripts:list", "scripts:source:read"]),
      })
    );
    expect(window.close).toHaveBeenCalledTimes(1);
  });

  it("点击拒绝调用 decidePairing({approved:false, grantedScopes:[]})", async () => {
    getPendingPairing.mockResolvedValue(basePairing());
    render(<McpPairingView pairingId="pair-1" />);
    fireEvent.click(await screen.findByTestId("mcp-pairing-reject"));
    await waitFor(() =>
      expect(decidePairing).toHaveBeenCalledWith({ pairingId: "pair-1", approved: false, grantedScopes: [] })
    );
    expect(window.close).toHaveBeenCalledTimes(1);
  });

  it("未勾选任何 scope 时批准按钮禁用", async () => {
    getPendingPairing.mockResolvedValue(basePairing({ requestedScopes: ["scripts:source:read"] }));
    render(<McpPairingView pairingId="pair-1" />);
    await screen.findByTestId("mcp-pairing-card");
    expect(screen.getByTestId("mcp-pairing-approve")).toBeDisabled();
  });

  it("倒计时归零后自动按拒绝处理", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "Date"] });
    getPendingPairing.mockResolvedValue(basePairing({ expiresAt: Date.now() + 2000 }));
    render(<McpPairingView pairingId="pair-1" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(decidePairing).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(decidePairing).toHaveBeenCalledWith({ pairingId: "pair-1", approved: false, grantedScopes: [] });
  });
});
