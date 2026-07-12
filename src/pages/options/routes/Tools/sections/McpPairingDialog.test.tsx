import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";

const { getPendingPairing, decidePairing } = vi.hoisted(() => ({
  getPendingPairing: vi.fn(),
  decidePairing: vi.fn(),
}));
vi.mock("@App/pages/store/features/script", () => ({
  mcpClient: { getPendingPairing, decidePairing },
}));

import { McpPairingDialog } from "./McpPairingDialog";

const basePairing = (over: Record<string, unknown> = {}) => ({
  pairingId: "pair-1",
  clientName: "Claude Desktop",
  requestedScopes: ["scripts:list", "scripts:metadata:read"],
  code: "ABCD1234",
  expiresAt: Date.now() + 120_000,
  ...over,
});

beforeAll(() => initTestLanguage("zh-CN"));

beforeEach(() => {
  vi.clearAllMocks();
  decidePairing.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("McpPairingDialog · options 页面内的配对对话框", () => {
  it("加载待处理配对后展示客户端名称、验证码与 scope 勾选", async () => {
    getPendingPairing.mockResolvedValue(basePairing());
    render(<McpPairingDialog pairingId="pair-1" onClose={vi.fn()} />);
    expect(await screen.findByTestId("mcp-pairing-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("mcp-pairing-dialog-client-name")).toHaveTextContent("Claude Desktop");
    expect(screen.getByTestId("mcp-pairing-code")).toHaveTextContent("ABCD1234");
  });

  it("点击批准调用 decidePairing 并在决定后调用 onClose", async () => {
    getPendingPairing.mockResolvedValue(basePairing());
    const onClose = vi.fn();
    render(<McpPairingDialog pairingId="pair-1" onClose={onClose} />);
    fireEvent.click(await screen.findByTestId("mcp-pairing-dialog-approve"));
    await waitFor(() =>
      expect(decidePairing).toHaveBeenCalledWith({
        pairingId: "pair-1",
        approved: true,
        grantedScopes: expect.arrayContaining(["scripts:list", "scripts:metadata:read"]),
      })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("点击拒绝调用 decidePairing({approved:false}) 并在决定后调用 onClose", async () => {
    getPendingPairing.mockResolvedValue(basePairing());
    const onClose = vi.fn();
    render(<McpPairingDialog pairingId="pair-1" onClose={onClose} />);
    fireEvent.click(await screen.findByTestId("mcp-pairing-dialog-reject"));
    await waitFor(() =>
      expect(decidePairing).toHaveBeenCalledWith({ pairingId: "pair-1", approved: false, grantedScopes: [] })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("找不到匹配的待处理配对时不渲染对话框", async () => {
    getPendingPairing.mockResolvedValue(undefined);
    render(<McpPairingDialog pairingId="pair-1" onClose={vi.fn()} />);
    await waitFor(() => expect(getPendingPairing).toHaveBeenCalled());
    expect(screen.queryByTestId("mcp-pairing-dialog")).not.toBeInTheDocument();
  });
});
