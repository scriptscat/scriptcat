import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";

const { getBridgeStatus, enroll, stopExternalAccess } = vi.hoisted(() => ({
  getBridgeStatus: vi.fn(
    (): Promise<{ status: string; daemonVersion?: string }> => Promise.resolve({ status: "connected" })
  ),
  enroll: vi.fn(() => Promise.resolve()),
  stopExternalAccess: vi.fn(() => Promise.resolve()),
}));
vi.mock("@App/pages/store/features/script", () => ({
  externalAccessClient: { getBridgeStatus, enroll, stopExternalAccess },
}));

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

const notify = vi.hoisted(() => ({
  success: vi.fn(),
  info: vi.fn(),
}));
vi.mock("@App/pages/components/ui/toast", () => ({ notify }));

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

  it("提交配对码后调用 enroll 并显示进行中提示", async () => {
    getBridgeStatus.mockResolvedValue({ status: "pending_enrollment" });
    await renderSection();
    fireEvent.click(await screen.findByTestId("external_access_enroll_open"));
    // 8 格 OTP 输入：粘贴整段配对码到第一格，一次填满
    const cell0 = await screen.findByTestId("external_access_enroll_code-cell-0");
    fireEvent.paste(cell0, { clipboardData: { getData: () => "ABCD1234" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("external_access_enroll_submit"));
    });
    expect(enroll).toHaveBeenCalledWith("ABCD1234");
    expect(notify.info).toHaveBeenCalledWith("已提交配对码，正在接入 sctl…");
    expect(notify.success).not.toHaveBeenCalled();
  });

  it("帮助入口与待接入文档入口深链到外部接入指南", async () => {
    getBridgeStatus.mockResolvedValue({ status: "pending_enrollment" });
    await renderSection();

    const expectedDocUrl = /^https:\/\/docs\.scriptcat\.org(?:\/en)?\/docs\/use\/external-access\/$/;
    expect(await screen.findByTestId("external_access_help")).toHaveAttribute(
      "href",
      expect.stringMatching(expectedDocUrl)
    );
    expect(screen.getByText("查看安装文档").closest("a")).toHaveAttribute(
      "href",
      expect.stringMatching(expectedDocUrl)
    );
  });

  it("已接入状态在状态条显示 sctl 版本号", async () => {
    getBridgeStatus.mockResolvedValue({ status: "connected", daemonVersion: "0.3.1" });
    await renderSection();
    expect(await screen.findByTestId("external_access_daemon_version")).toHaveTextContent("sctl v0.3.1");
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
