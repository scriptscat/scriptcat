import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";

const { getOperation, decideOperation, findInfo } = vi.hoisted(() => ({
  getOperation: vi.fn(),
  decideOperation: vi.fn(),
  findInfo: vi.fn(),
}));
vi.mock("@App/pages/store/features/script", () => ({
  externalAccessClient: { getOperation, decideOperation },
  scriptClient: { findInfo },
}));

import { ExternalAccessConfirmView } from "./App";

const baseOp = (over: Record<string, unknown> = {}) => ({
  operationId: "op-1",
  kind: "enable",
  status: "awaiting_user",
  targetUuid: "script-uuid-1",
  ...over,
});

beforeAll(() => initTestLanguage("zh-CN"));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, "close").mockImplementation(() => {});
  decideOperation.mockResolvedValue(undefined);
  findInfo.mockResolvedValue({
    uuid: "script-uuid-1",
    name: "自动签到脚本",
    metadata: { version: ["1.2.0"] },
    author: "dao",
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("外部接入 · 操作确认页（三档决策）", () => {
  it("挂起操作展示脚本名称与基于渠道的描述（不显示客户端名）", async () => {
    getOperation.mockResolvedValue(baseOp());
    render(<ExternalAccessConfirmView operationId="op-1" />);
    expect(await screen.findByTestId("external-access-confirm-card")).toBeInTheDocument();
    expect(screen.getByText("自动签到脚本")).toBeInTheDocument();
    expect(screen.getByText(/通过外部接入触发/)).toBeInTheDocument();
  });

  it("操作不存在或已过期时展示过期提示，而非确认卡片", async () => {
    getOperation.mockResolvedValue(undefined);
    render(<ExternalAccessConfirmView operationId="op-1" />);
    expect(await screen.findByTestId("external-access-confirm-expired")).toBeInTheDocument();
    expect(screen.queryByTestId("external-access-confirm-card")).not.toBeInTheDocument();
  });

  it("状态非 awaiting_user 时视为过期", async () => {
    getOperation.mockResolvedValue(baseOp({ status: "approved" }));
    render(<ExternalAccessConfirmView operationId="op-1" />);
    expect(await screen.findByTestId("external-access-confirm-expired")).toBeInTheDocument();
  });

  it("enable 点「允许」调用 decideOperation({approved:true, enable:true}) 并关闭窗口", async () => {
    getOperation.mockResolvedValue(baseOp({ kind: "enable" }));
    render(<ExternalAccessConfirmView operationId="op-1" />);
    fireEvent.click(await screen.findByTestId("external-access-confirm-approve"));
    await waitFor(() =>
      expect(decideOperation).toHaveBeenCalledWith({ operationId: "op-1", approved: true, enable: true })
    );
    expect(window.close).toHaveBeenCalledTimes(1);
  });

  it("disable 点「允许」时 enable 为 false", async () => {
    getOperation.mockResolvedValue(baseOp({ kind: "disable" }));
    render(<ExternalAccessConfirmView operationId="op-1" />);
    fireEvent.click(await screen.findByTestId("external-access-confirm-approve"));
    await waitFor(() =>
      expect(decideOperation).toHaveBeenCalledWith({ operationId: "op-1", approved: true, enable: false })
    );
  });

  it("点「本会话允许」携带 rememberSession:true", async () => {
    getOperation.mockResolvedValue(baseOp({ kind: "enable" }));
    render(<ExternalAccessConfirmView operationId="op-1" />);
    fireEvent.click(await screen.findByTestId("external-access-confirm-session-allow"));
    await waitFor(() =>
      expect(decideOperation).toHaveBeenCalledWith({
        operationId: "op-1",
        approved: true,
        enable: true,
        rememberSession: true,
      })
    );
  });

  it("点「拒绝」调用 decideOperation({approved:false}) 并关闭窗口", async () => {
    getOperation.mockResolvedValue(baseOp({ kind: "enable" }));
    render(<ExternalAccessConfirmView operationId="op-1" />);
    fireEvent.click(await screen.findByTestId("external-access-confirm-reject"));
    await waitFor(() => expect(decideOperation).toHaveBeenCalledWith({ operationId: "op-1", approved: false }));
    expect(window.close).toHaveBeenCalledTimes(1);
  });

  it("delete 使用同一套三档决策（销毁性主按钮），点允许即批准", async () => {
    getOperation.mockResolvedValue(baseOp({ kind: "delete" }));
    render(<ExternalAccessConfirmView operationId="op-1" />);
    fireEvent.click(await screen.findByTestId("external-access-confirm-approve"));
    await waitFor(() =>
      expect(decideOperation).toHaveBeenCalledWith({ operationId: "op-1", approved: true, enable: false })
    );
  });

  it("重复点击「允许」只触发一次决定", async () => {
    getOperation.mockResolvedValue(baseOp({ kind: "enable" }));
    render(<ExternalAccessConfirmView operationId="op-1" />);
    const approveButton = await screen.findByTestId("external-access-confirm-approve");
    fireEvent.click(approveButton);
    fireEvent.click(approveButton);
    await waitFor(() => expect(decideOperation).toHaveBeenCalledTimes(1));
  });

  it("source_disclosure 展示隐私提示并沿用三档决策", async () => {
    getOperation.mockResolvedValue(baseOp({ kind: "source_disclosure" }));
    render(<ExternalAccessConfirmView operationId="op-1" />);
    expect(await screen.findByTestId("external-access-confirm-card")).toBeInTheDocument();
    expect(screen.getByTestId("external-access-confirm-session-allow")).toBeInTheDocument();
    expect(screen.getByTestId("external-access-confirm-approve")).toBeInTheDocument();
    expect(screen.getByTestId("external-access-confirm-reject")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("external-access-confirm-approve"));
    await waitFor(() =>
      expect(decideOperation).toHaveBeenCalledWith({ operationId: "op-1", approved: true, enable: false })
    );
  });
});
