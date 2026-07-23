import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";

const { getBridgeStatus, enroll, stopExternalAccess } = vi.hoisted(() => ({
  getBridgeStatus: vi.fn(() => Promise.resolve("connected")),
  enroll: vi.fn(() => Promise.resolve()),
  stopExternalAccess: vi.fn(() => Promise.resolve()),
}));
vi.mock("@App/pages/store/features/script", () => ({
  mcpClient: { getBridgeStatus, enroll, stopExternalAccess },
}));

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

const {
  get,
  set,
  getMcpWritePolicy,
  setMcpWritePolicy,
  getMcpSourceReadPolicy,
  setMcpSourceReadPolicy,
  getMcpUrl,
  setMcpUrl,
  subscribeMessage,
} = vi.hoisted(() => ({
  get: vi.fn(() => Promise.resolve(true)),
  set: vi.fn(),
  getMcpWritePolicy: vi.fn(() => Promise.resolve("approval")),
  setMcpWritePolicy: vi.fn(),
  getMcpSourceReadPolicy: vi.fn(() => Promise.resolve("approval")),
  setMcpSourceReadPolicy: vi.fn(),
  getMcpUrl: vi.fn(() => Promise.resolve("ws://localhost:8643")),
  setMcpUrl: vi.fn(),
  subscribeMessage: vi.fn(() => () => {}),
}));
vi.mock("@App/pages/store/global", () => ({
  systemConfig: {
    get,
    set,
    getMcpWritePolicy,
    setMcpWritePolicy,
    getMcpSourceReadPolicy,
    setMcpSourceReadPolicy,
    getMcpUrl,
    setMcpUrl,
  },
  subscribeMessage,
}));

import { ExternalAccessSection } from "./ExternalAccessSection";

const register = () => () => {};

beforeAll(() => initTestLanguage("zh-CN"));

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue(true);
  getBridgeStatus.mockResolvedValue("connected");
  getMcpWritePolicy.mockResolvedValue("approval");
  getMcpSourceReadPolicy.mockResolvedValue("approval");
  getMcpUrl.mockResolvedValue("ws://localhost:8643");
});
afterEach(cleanup);

async function renderSection() {
  render(<ExternalAccessSection register={register} />);
  await waitFor(() => expect(getBridgeStatus).toHaveBeenCalled());
}

describe("ExternalAccessSection（外部接入单卡片）", () => {
  it("已接入状态展示状态胶囊、策略、查看审计与停止外部接入", async () => {
    getBridgeStatus.mockResolvedValue("connected");
    await renderSection();
    expect(await screen.findByTestId("mcp_status_pill")).toBeInTheDocument();
    expect(screen.getByTestId("mcp_write_policy_approval")).toBeInTheDocument();
    expect(screen.getByTestId("mcp_source_policy_approval")).toBeInTheDocument();
    expect(screen.getByTestId("mcp_view_audit")).toBeInTheDocument();
    expect(screen.getByTestId("mcp_stop")).toBeInTheDocument();
  });

  it("待接入状态展示地址输入与「接入 sctl」按钮", async () => {
    getBridgeStatus.mockResolvedValue("pending_enrollment");
    await renderSection();
    expect(await screen.findByTestId("mcp_url_input")).toBeInTheDocument();
    expect(screen.getByTestId("mcp_enroll_open")).toBeInTheDocument();
  });

  it("接入对话框输入配对码并提交调用 mcpClient.enroll", async () => {
    getBridgeStatus.mockResolvedValue("pending_enrollment");
    await renderSection();
    fireEvent.click(await screen.findByTestId("mcp_enroll_open"));
    const codeInput = await screen.findByTestId("mcp_enroll_code");
    fireEvent.change(codeInput, { target: { value: "ABCD1234" } });
    fireEvent.click(screen.getByTestId("mcp_enroll_submit"));
    await waitFor(() => expect(enroll).toHaveBeenCalledWith("ABCD1234"));
  });

  it("写操作策略切到「直接允许」时写入配置并显示琥珀警示", async () => {
    getBridgeStatus.mockResolvedValue("connected");
    await renderSection();
    fireEvent.click(await screen.findByTestId("mcp_write_policy_allow"));
    expect(setMcpWritePolicy).toHaveBeenCalledWith("allow");
    expect(await screen.findByTestId("mcp_write_policy_warning")).toBeInTheDocument();
  });

  it("源码读取策略切到「直接允许」时写入配置", async () => {
    getBridgeStatus.mockResolvedValue("connected");
    await renderSection();
    fireEvent.click(await screen.findByTestId("mcp_source_policy_allow"));
    expect(setMcpSourceReadPolicy).toHaveBeenCalledWith("allow");
  });

  it("查看审计日志深链到日志页并以 component=local-access 预过滤", async () => {
    getBridgeStatus.mockResolvedValue("connected");
    await renderSection();
    fireEvent.click(await screen.findByTestId("mcp_view_audit"));
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining("/logs?query="));
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining("local-access"));
  });

  it("关闭启用开关写入 mcp_enabled=false", async () => {
    getBridgeStatus.mockResolvedValue("connected");
    await renderSection();
    fireEvent.click(await screen.findByTestId("mcp_enable_switch"));
    expect(set).toHaveBeenCalledWith("mcp_enabled", false);
  });
});
