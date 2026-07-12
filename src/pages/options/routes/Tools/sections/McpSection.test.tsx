import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

const { getBridgeStatus, getClients, getAudit, setWriteSession, revokeClient, revokeAllAndStop, clearAudit } =
  vi.hoisted(() => ({
    getBridgeStatus: vi.fn(() => Promise.resolve("connected")),
    getClients: vi.fn(() => Promise.resolve([] as any[])),
    getAudit: vi.fn(() => Promise.resolve([] as any[])),
    setWriteSession: vi.fn(() => Promise.resolve()),
    revokeClient: vi.fn(() => Promise.resolve()),
    revokeAllAndStop: vi.fn(() => Promise.resolve()),
    clearAudit: vi.fn(() => Promise.resolve()),
  }));
vi.mock("@App/app/service/service_worker/client", () => ({
  MCPClient: class {
    getBridgeStatus = getBridgeStatus;
    getClients = getClients;
    getAudit = getAudit;
    setWriteSession = setWriteSession;
    revokeClient = revokeClient;
    revokeAllAndStop = revokeAllAndStop;
    clearAudit = clearAudit;
  },
}));

const { get, set, subscribeMessage, pairingHandlers } = vi.hoisted(() => {
  const pairingHandlers: Array<(data: { pairingId: string }) => void> = [];
  return {
    get: vi.fn(),
    set: vi.fn(),
    subscribeMessage: vi.fn((topic: string, handler: (data: any) => void) => {
      if (topic === "mcpPairingRequested") pairingHandlers.push(handler);
      return () => {};
    }),
    pairingHandlers,
  };
});
vi.mock("@App/pages/store/global", () => ({ systemConfig: { get, set }, message: {}, subscribeMessage }));

// McpPairingDialog (rendered by McpSection when a pairing is pending) pulls in
// @App/pages/mcp_confirm/usePendingPairing.ts, which imports @App/pages/store/features/script —
// a module that constructs real Client instances (ScriptClient, etc.) from
// @App/app/service/service_worker/client, whose mock above doesn't export them. Mocking the
// feature-store module directly (matching mcp_confirm/App.test.tsx's own convention) avoids that
// transitive construction without widening the client mock for an unrelated test file.
vi.mock("@App/pages/mcp_confirm/usePendingPairing", () => ({
  usePendingPairing: vi.fn(() => ({
    pairing: undefined,
    loadError: false,
    selected: new Set(),
    secondsLeft: 0,
    decide: vi.fn(),
    toggleScope: vi.fn(),
  })),
}));

import { McpSection } from "./McpSection";

afterEach(() => {
  cleanup();
  get.mockReset();
  set.mockReset();
  getBridgeStatus.mockClear();
  getClients.mockClear();
  getAudit.mockClear();
  setWriteSession.mockClear();
  revokeClient.mockClear();
  revokeAllAndStop.mockClear();
  clearAudit.mockClear();
  pairingHandlers.length = 0;
});

describe("MCP 桥接分区", () => {
  it("mcp_enabled 为 false 时不显示已连接客户端的详情区块", async () => {
    get.mockResolvedValue(false);
    render(<McpSection register={() => () => {}} />);
    expect(await screen.findByTestId("mcp_enable_switch")).toBeInTheDocument();
    expect(screen.queryByTestId("mcp_write_switch")).not.toBeInTheDocument();
  });

  it("点击启用开关先弹出警告对话框，取消后不写入配置", async () => {
    get.mockResolvedValue(false);
    render(<McpSection register={() => () => {}} />);
    await screen.findByTestId("mcp_enable_switch");
    fireEvent.click(screen.getByTestId("mcp_enable_switch"));
    expect(await screen.findByTestId("mcp_enable_confirm")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("mcp_enable_cancel"));
    expect(set).not.toHaveBeenCalledWith("mcp_enabled", true);
  });

  it("确认启用对话框后写入 mcp_enabled=true", async () => {
    get.mockResolvedValue(false);
    render(<McpSection register={() => () => {}} />);
    await screen.findByTestId("mcp_enable_switch");
    fireEvent.click(screen.getByTestId("mcp_enable_switch"));
    fireEvent.click(await screen.findByTestId("mcp_enable_confirm"));
    expect(set).toHaveBeenCalledWith("mcp_enabled", true);
  });

  it("已启用时展示写会话开关，切换后调用 setWriteSession", async () => {
    get.mockResolvedValue(true);
    render(<McpSection register={() => () => {}} />);
    const writeSwitch = await screen.findByTestId("mcp_write_switch");
    await act(async () => fireEvent.click(writeSwitch));
    expect(setWriteSession).toHaveBeenCalledWith(true);
  });

  it("已启用时展示客户端列表，点击撤销并确认后调用 revokeClient", async () => {
    get.mockResolvedValue(true);
    getClients.mockResolvedValue([
      {
        clientId: "c1",
        displayName: "Test Client",
        tokenHash: "hash",
        scopes: ["scripts:list"],
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        revoked: false,
      },
    ]);
    render(<McpSection register={() => () => {}} />);
    expect(await screen.findByText("Test Client")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("mcp_revoke_c1"));
    fireEvent.click(await screen.findByRole("button", { name: /confirm/i }));
    await waitFor(() => expect(revokeClient).toHaveBeenCalledWith("c1"));
  });

  it("审计日志为空时显示占位文案", async () => {
    get.mockResolvedValue(true);
    getAudit.mockResolvedValue([]);
    render(<McpSection register={() => () => {}} />);
    expect(await screen.findByTestId("mcp_audit_export")).toBeInTheDocument();
    expect(screen.queryByTestId("mcp_audit_list")).not.toBeInTheDocument();
  });

  it("审计日志有事件时渲染列表", async () => {
    get.mockResolvedValue(true);
    getAudit.mockResolvedValue([
      {
        eventId: "e1",
        timestamp: Date.now(),
        clientId: "c1",
        clientName: "Test Client",
        action: "scripts.list",
        decision: "allowed",
        correlationId: "corr-1",
      },
    ]);
    render(<McpSection register={() => () => {}} />);
    expect(await screen.findByTestId("mcp_audit_list")).toBeInTheDocument();
  });

  it("Revoke all & stop 确认后调用 revokeAllAndStop 并关闭 mcp_enabled", async () => {
    get.mockResolvedValue(true);
    render(<McpSection register={() => () => {}} />);
    const stopButton = await screen.findByTestId("mcp_revoke_all_stop");
    fireEvent.click(stopButton);
    fireEvent.click(await screen.findByRole("button", { name: /confirm/i }));
    await waitFor(() => expect(revokeAllAndStop).toHaveBeenCalled());
    expect(set).toHaveBeenCalledWith("mcp_enabled", false);
  });

  it("订阅 mcpPairingRequested 广播，收到后渲染页面内配对对话框（doc 05 §5.4）", async () => {
    get.mockResolvedValue(true);
    render(<McpSection register={() => () => {}} />);
    await screen.findByTestId("mcp_enable_switch");
    expect(subscribeMessage).toHaveBeenCalledWith("mcpPairingRequested", expect.any(Function));
    expect(screen.queryByTestId("mcp-pairing-dialog")).not.toBeInTheDocument();

    act(() => {
      pairingHandlers.forEach((handler) => handler({ pairingId: "pair-1" }));
    });
    expect(await screen.findByTestId("mcp-pairing-dialog")).toBeInTheDocument();
  });
});
