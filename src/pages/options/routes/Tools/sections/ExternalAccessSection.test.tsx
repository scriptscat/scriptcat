import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";

const { getBridgeStatus, enroll, stopExternalAccess } = vi.hoisted(() => ({
  getBridgeStatus: vi.fn(() => Promise.resolve({ status: "connected" })),
  enroll: vi.fn(() => Promise.resolve()),
  stopExternalAccess: vi.fn(() => Promise.resolve()),
}));
vi.mock("@App/pages/store/features/script", () => ({
  externalAccessClient: { getBridgeStatus, enroll, stopExternalAccess },
}));

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

const {
  get,
  set,
  getExternalAccessWritePolicy,
  setExternalAccessWritePolicy,
  getExternalAccessSourceReadPolicy,
  setExternalAccessSourceReadPolicy,
  getExternalAccessUrl,
  setExternalAccessUrl,
  subscribeMessage,
} = vi.hoisted(() => ({
  get: vi.fn(() => Promise.resolve(true)),
  set: vi.fn(),
  getExternalAccessWritePolicy: vi.fn(() => Promise.resolve("approval")),
  setExternalAccessWritePolicy: vi.fn(),
  getExternalAccessSourceReadPolicy: vi.fn(() => Promise.resolve("approval")),
  setExternalAccessSourceReadPolicy: vi.fn(),
  getExternalAccessUrl: vi.fn(() => Promise.resolve("ws://localhost:8643")),
  setExternalAccessUrl: vi.fn(),
  subscribeMessage: vi.fn(() => () => {}),
}));
vi.mock("@App/pages/store/global", () => ({
  systemConfig: {
    get,
    set,
    getExternalAccessWritePolicy,
    setExternalAccessWritePolicy,
    getExternalAccessSourceReadPolicy,
    setExternalAccessSourceReadPolicy,
    getExternalAccessUrl,
    setExternalAccessUrl,
  },
  subscribeMessage,
}));

import { ExternalAccessSection } from "./ExternalAccessSection";

const register = () => () => {};

beforeAll(() => initTestLanguage("zh-CN"));

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue(true);
  getBridgeStatus.mockResolvedValue({ status: "connected" });
  getExternalAccessWritePolicy.mockResolvedValue("approval");
  getExternalAccessSourceReadPolicy.mockResolvedValue("approval");
  getExternalAccessUrl.mockResolvedValue("ws://localhost:8643");
});
afterEach(cleanup);

async function renderSection() {
  render(<ExternalAccessSection register={register} />);
  await waitFor(() => expect(getBridgeStatus).toHaveBeenCalled());
}

describe("ExternalAccessSection（外部接入单卡片）", () => {
  it("已接入状态展示状态胶囊、策略、查看审计与停止外部接入", async () => {
    getBridgeStatus.mockResolvedValue({ status: "connected" });
    await renderSection();
    expect(await screen.findByTestId("external_access_status_pill")).toBeInTheDocument();
    expect(screen.getByTestId("external_access_write_policy_approval")).toBeInTheDocument();
    expect(screen.getByTestId("external_access_source_policy_approval")).toBeInTheDocument();
    expect(screen.getByTestId("external_access_view_audit")).toBeInTheDocument();
    expect(screen.getByTestId("external_access_stop")).toBeInTheDocument();
  });

  it("待接入状态展示地址输入与「接入 sctl」按钮", async () => {
    getBridgeStatus.mockResolvedValue({ status: "pending_enrollment" });
    await renderSection();
    expect(await screen.findByTestId("external_access_url_input")).toBeInTheDocument();
    expect(screen.getByTestId("external_access_enroll_open")).toBeInTheDocument();
  });

  it("接入对话框输入配对码并提交调用 externalAccessClient.enroll", async () => {
    getBridgeStatus.mockResolvedValue({ status: "pending_enrollment" });
    await renderSection();
    fireEvent.click(await screen.findByTestId("external_access_enroll_open"));
    const codeInput = await screen.findByTestId("external_access_enroll_code");
    fireEvent.change(codeInput, { target: { value: "ABCD1234" } });
    fireEvent.click(screen.getByTestId("external_access_enroll_submit"));
    await waitFor(() => expect(enroll).toHaveBeenCalledWith("ABCD1234"));
  });

  it("写操作策略切到「直接允许」时写入配置并显示琥珀警示", async () => {
    getBridgeStatus.mockResolvedValue({ status: "connected" });
    await renderSection();
    fireEvent.click(await screen.findByTestId("external_access_write_policy_allow"));
    expect(setExternalAccessWritePolicy).toHaveBeenCalledWith("allow");
    expect(await screen.findByTestId("external_access_write_policy_warning")).toBeInTheDocument();
  });

  it("源码读取策略切到「直接允许」时写入配置", async () => {
    getBridgeStatus.mockResolvedValue({ status: "connected" });
    await renderSection();
    fireEvent.click(await screen.findByTestId("external_access_source_policy_allow"));
    expect(setExternalAccessSourceReadPolicy).toHaveBeenCalledWith("allow");
  });

  it("查看审计日志深链到日志页并以 component=external-access 预过滤", async () => {
    getBridgeStatus.mockResolvedValue({ status: "connected" });
    await renderSection();
    fireEvent.click(await screen.findByTestId("external_access_view_audit"));
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining("/logs?query="));
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining("external-access"));
  });

  it("关闭启用开关写入 external_access_enabled=false", async () => {
    getBridgeStatus.mockResolvedValue({ status: "connected" });
    await renderSection();
    fireEvent.click(await screen.findByTestId("external_access_enable_switch"));
    expect(set).toHaveBeenCalledWith("external_access_enabled", false);
  });
});
