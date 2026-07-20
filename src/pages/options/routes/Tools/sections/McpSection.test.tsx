import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

const {
  getBridgeStatus,
  getClients,
  getAudit,
  getPendingOperations,
  reopenOperation,
  pair,
  setWriteSession,
  getWriteSession,
  revokeClient,
  revokeAllAndStop,
  clearAudit,
} = vi.hoisted(() => ({
  getBridgeStatus: vi.fn(() => Promise.resolve("connected")),
  getClients: vi.fn(() => Promise.resolve([] as any[])),
  getAudit: vi.fn(() => Promise.resolve([] as any[])),
  getPendingOperations: vi.fn(() => Promise.resolve([] as any[])),
  reopenOperation: vi.fn(() => Promise.resolve()),
  pair: vi.fn(() => Promise.resolve()),
  setWriteSession: vi.fn(() => Promise.resolve()),
  getWriteSession: vi.fn(() => Promise.resolve(false)),
  revokeClient: vi.fn(() => Promise.resolve()),
  revokeAllAndStop: vi.fn(() => Promise.resolve()),
  clearAudit: vi.fn(() => Promise.resolve()),
}));
vi.mock("@App/app/service/service_worker/client", () => ({
  MCPClient: class {
    getBridgeStatus = getBridgeStatus;
    getClients = getClients;
    getAudit = getAudit;
    getPendingOperations = getPendingOperations;
    reopenOperation = reopenOperation;
    pair = pair;
    setWriteSession = setWriteSession;
    getWriteSession = getWriteSession;
    revokeClient = revokeClient;
    revokeAllAndStop = revokeAllAndStop;
    clearAudit = clearAudit;
  },
}));

const {
  get,
  set,
  getMcpWritePolicy,
  setMcpWritePolicy,
  getMcpUrl,
  setMcpUrl,
  subscribeMessage,
  pairingHandlers,
  statusHandlers,
} = vi.hoisted(() => {
  const pairingHandlers: Array<(data: { pairingId: string }) => void> = [];
  const statusHandlers: Array<(data: { status: string }) => void> = [];
  return {
    get: vi.fn(),
    set: vi.fn(),
    getMcpWritePolicy: vi.fn(() => Promise.resolve("approval")),
    setMcpWritePolicy: vi.fn(),
    getMcpUrl: vi.fn(() => Promise.resolve("ws://127.0.0.1:8643")),
    setMcpUrl: vi.fn(),
    subscribeMessage: vi.fn((topic: string, handler: (data: any) => void) => {
      if (topic === "mcpPairingRequested") pairingHandlers.push(handler);
      if (topic === "mcpStatusChanged") statusHandlers.push(handler);
      return () => {};
    }),
    pairingHandlers,
    statusHandlers,
  };
});
vi.mock("@App/pages/store/global", () => ({
  systemConfig: { get, set, getMcpWritePolicy, setMcpWritePolicy, getMcpUrl, setMcpUrl },
  message: {},
  subscribeMessage,
}));

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
  getMcpWritePolicy.mockReset();
  getMcpWritePolicy.mockResolvedValue("approval");
  setMcpWritePolicy.mockReset();
  getMcpUrl.mockReset();
  getMcpUrl.mockResolvedValue("ws://127.0.0.1:8643");
  setMcpUrl.mockReset();
  getBridgeStatus.mockClear();
  getClients.mockClear();
  getAudit.mockClear();
  getPendingOperations.mockReset();
  getPendingOperations.mockResolvedValue([]);
  reopenOperation.mockClear();
  pair.mockClear();
  setWriteSession.mockClear();
  getWriteSession.mockReset();
  getWriteSession.mockResolvedValue(false);
  revokeClient.mockClear();
  revokeAllAndStop.mockClear();
  clearAudit.mockClear();
  pairingHandlers.length = 0;
  statusHandlers.length = 0;
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

  it("已启用时展示连接地址与配对码入口，输入配对码后点击配对调用 pair", async () => {
    get.mockResolvedValue(true);
    render(<McpSection register={() => () => {}} />);
    const codeInput = await screen.findByTestId("mcp_pair_code_input");
    const pairButton = screen.getByTestId("mcp_pair_button");
    expect(pairButton).toBeDisabled();
    fireEvent.change(codeInput, { target: { value: "MNBV-3456" } });
    expect(pairButton).not.toBeDisabled();
    await act(async () => fireEvent.click(pairButton));
    expect(pair).toHaveBeenCalledWith("MNBV-3456");
  });

  it("修改连接地址失焦后写入 mcp_url", async () => {
    get.mockResolvedValue(true);
    render(<McpSection register={() => () => {}} />);
    const urlInput = await screen.findByTestId("mcp_url_input");
    fireEvent.change(urlInput, { target: { value: "ws://127.0.0.1:9000" } });
    fireEvent.blur(urlInput);
    expect(setMcpUrl).toHaveBeenCalledWith("ws://127.0.0.1:9000");
  });

  it("已启用时展示写策略开关，切换为直接允许后写入 mcp_write_policy 并显示琥珀警告", async () => {
    get.mockResolvedValue(true);
    getMcpWritePolicy.mockResolvedValue("approval");
    render(<McpSection register={() => () => {}} />);
    const policySwitch = await screen.findByTestId("mcp_write_policy_switch");
    expect(screen.queryByTestId("mcp_write_policy_warning")).not.toBeInTheDocument();
    await act(async () => fireEvent.click(policySwitch));
    expect(setMcpWritePolicy).toHaveBeenCalledWith("allow");
    expect(await screen.findByTestId("mcp_write_policy_warning")).toBeInTheDocument();
  });

  it("初始为直接允许策略时开关为开且直接显示警告", async () => {
    get.mockResolvedValue(true);
    getMcpWritePolicy.mockResolvedValue("allow");
    render(<McpSection register={() => () => {}} />);
    expect(await screen.findByTestId("mcp_write_policy_warning")).toBeInTheDocument();
  });

  it("有待确认操作时渲染待确认列表，点击重新打开调用 reopenOperation", async () => {
    get.mockResolvedValue(true);
    getPendingOperations.mockResolvedValue([
      { operationId: "op-1", kind: "install", requestingClientName: "Claude Desktop", createdAt: Date.now() },
    ]);
    render(<McpSection register={() => () => {}} />);
    expect(await screen.findByTestId("mcp_pending_list")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("mcp_pending_reopen_op-1"));
    await waitFor(() => expect(reopenOperation).toHaveBeenCalledWith("op-1"));
  });

  it("没有待确认操作时不渲染待确认列表", async () => {
    get.mockResolvedValue(true);
    getPendingOperations.mockResolvedValue([]);
    render(<McpSection register={() => () => {}} />);
    await screen.findByTestId("mcp_enable_switch");
    expect(screen.queryByTestId("mcp_pending_list")).not.toBeInTheDocument();
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

  // 写会话只写不读会让刷新后的开关显示为关、实际写权限还开着——用户会以为自己已经关掉了授权。
  it("挂载时把 SW 侧的写会话状态同步到开关，而不是一律显示为关", async () => {
    get.mockResolvedValue(true);
    getWriteSession.mockResolvedValue(true);
    render(<McpSection register={() => () => {}} />);
    await waitFor(() => expect(screen.getByTestId("mcp_write_switch")).toBeChecked());
  });

  it("订阅 mcpStatusChanged 广播，配对成功后状态胶囊无需刷新页面即更新", async () => {
    get.mockResolvedValue(true);
    getBridgeStatus.mockResolvedValue("disabled");
    render(<McpSection register={() => () => {}} />);
    expect(await screen.findByTestId("mcp_status_pill")).toHaveTextContent("mcp:status_off");

    act(() => {
      statusHandlers.forEach((handler) => handler({ status: "connected" }));
    });
    expect(screen.getByTestId("mcp_status_pill")).toHaveTextContent("mcp:status_connected");
  });

  it("桥接断开的广播同样反映到状态胶囊", async () => {
    get.mockResolvedValue(true);
    getBridgeStatus.mockResolvedValue("connected");
    render(<McpSection register={() => () => {}} />);
    expect(await screen.findByTestId("mcp_status_pill")).toHaveTextContent("mcp:status_connected");

    act(() => {
      statusHandlers.forEach((handler) => handler({ status: "host_unreachable" }));
    });
    expect(screen.getByTestId("mcp_status_pill")).toHaveTextContent("mcp:status_host_unreachable");
    // 断开态才有的重试入口，胶囊之外的条件渲染也应跟着广播走
    expect(screen.getByTestId("mcp_retry")).toBeInTheDocument();
  });

  it("订阅 mcpPairingRequested 广播，收到后渲染页面内配对对话框", async () => {
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
