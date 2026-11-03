import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
import type {
  ExternalAccessBridgeStatusInfo,
  ExternalAccessEnrollResult,
  ExternalAccessRenameResult,
} from "@App/app/service/service_worker/external_access/types";
import { initTestLanguage } from "@Tests/initTestLanguage";

const { getBridgeStatus, enroll, rename, stopExternalAccess } = vi.hoisted(() => ({
  getBridgeStatus: vi.fn<() => Promise<ExternalAccessBridgeStatusInfo>>(),
  enroll: vi.fn<(code: string, name: string) => Promise<ExternalAccessEnrollResult>>(),
  rename: vi.fn<(name: string) => Promise<ExternalAccessRenameResult>>(),
  stopExternalAccess: vi.fn(() => Promise.resolve()),
}));
vi.mock("@App/pages/store/features/script", () => ({
  externalAccessClient: { getBridgeStatus, enroll, rename, stopExternalAccess },
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
  getBridgeStatus.mockResolvedValue({ status: "connected", name: "work" });
  getExternalAccessWritePolicy.mockResolvedValue("approval");
  getExternalAccessSourceReadPolicy.mockResolvedValue("approval");
  getExternalAccessUrl.mockResolvedValue("ws://localhost:8643");
  enroll.mockResolvedValue("ok");
  rename.mockResolvedValue("ok");
});
afterEach(cleanup);

async function renderSection() {
  render(<ExternalAccessSection register={register} />);
  await waitFor(() => expect(getBridgeStatus).toHaveBeenCalled());
}

describe("ExternalAccessSection（外部接入单卡片）", () => {
  it("已接入状态展示状态胶囊、策略、查看审计与停止外部接入", async () => {
    getBridgeStatus.mockResolvedValue({ status: "connected", name: "work" });
    await renderSection();
    expect(await screen.findByTestId("external_access_status_pill")).toBeInTheDocument();
    expect(screen.getByTestId("external_access_write_policy_approval")).toBeInTheDocument();
    expect(screen.getByTestId("external_access_source_policy_approval")).toBeInTheDocument();
    expect(screen.getByTestId("external_access_view_audit")).toBeInTheDocument();
    expect(screen.getByTestId("external_access_stop")).toBeInTheDocument();
  });

  it("待接入状态展示地址输入与「接入 sctl」按钮", async () => {
    getBridgeStatus.mockResolvedValue({ status: "pending_enrollment", name: "work" });
    await renderSection();
    expect(await screen.findByTestId("external_access_url_input")).toBeInTheDocument();
    expect(screen.getByTestId("external_access_enroll_open")).toBeInTheDocument();
  });

  it("提交配对码后调用 enroll 并显示进行中提示", async () => {
    getBridgeStatus.mockResolvedValue({ status: "pending_enrollment", name: "home-browser" });
    await renderSection();
    fireEvent.click(await screen.findByTestId("external_access_enroll_open"));
    // 8 格 OTP 输入：粘贴整段配对码到第一格，一次填满
    const cell0 = await screen.findByTestId("external_access_enroll_code-cell-0");
    fireEvent.paste(cell0, { clipboardData: { getData: () => "ABCD1234" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("external_access_enroll_submit"));
    });
    expect(enroll).toHaveBeenCalledWith("ABCD1234", "home-browser");
    expect(notify.info).toHaveBeenCalledWith("已提交配对码，正在接入 sctl…");
    expect(notify.success).not.toHaveBeenCalled();
  });

  it("帮助入口与待接入文档入口深链到外部接入指南", async () => {
    getBridgeStatus.mockResolvedValue({ status: "pending_enrollment", name: "work" });
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
    getBridgeStatus.mockResolvedValue({ status: "connected", name: "work", daemonVersion: "0.3.1" });
    await renderSection();
    expect(await screen.findByTestId("external_access_daemon_version")).toHaveTextContent("sctl v0.3.1");
  });

  it("写操作策略切到「直接允许」时写入配置并显示琥珀警示", async () => {
    getBridgeStatus.mockResolvedValue({ status: "connected", name: "work" });
    await renderSection();
    fireEvent.click(await screen.findByTestId("external_access_write_policy_allow"));
    expect(setExternalAccessWritePolicy).toHaveBeenCalledWith("allow");
    expect(await screen.findByTestId("external_access_write_policy_warning")).toBeInTheDocument();
  });

  it("源码读取策略切到「直接允许」时写入配置", async () => {
    getBridgeStatus.mockResolvedValue({ status: "connected", name: "work" });
    await renderSection();
    fireEvent.click(await screen.findByTestId("external_access_source_policy_allow"));
    expect(setExternalAccessSourceReadPolicy).toHaveBeenCalledWith("allow");
  });

  it("查看审计日志深链到日志页并以 component=external-access 预过滤", async () => {
    getBridgeStatus.mockResolvedValue({ status: "connected", name: "work" });
    await renderSection();
    fireEvent.click(await screen.findByTestId("external_access_view_audit"));
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining("/logs?query="));
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining("external-access"));
  });

  it("关闭启用开关写入 external_access_enabled=false", async () => {
    getBridgeStatus.mockResolvedValue({ status: "connected", name: "work" });
    await renderSection();
    fireEvent.click(await screen.findByTestId("external_access_enable_switch"));
    expect(set).toHaveBeenCalledWith("external_access_enabled", false);
  });

  it("已接入状态显示实例名称与修改按钮", async () => {
    getBridgeStatus.mockResolvedValue({ status: "connected", name: "work" });
    await renderSection();
    expect(await screen.findByTestId("external_access_name_value")).toHaveTextContent("work");
    expect(screen.getByTestId("external_access_name_edit")).toBeInTheDocument();
  });

  it("修改名称为不合规值时即时提示并禁用保存", async () => {
    getBridgeStatus.mockResolvedValue({ status: "connected", name: "work" });
    await renderSection();
    fireEvent.click(await screen.findByTestId("external_access_name_edit"));
    const input = await screen.findByTestId("external_access_name_input");
    fireEvent.change(input, { target: { value: "Bad Name" } });
    expect(screen.getByTestId("external_access_name_error")).toHaveTextContent("名称需为 1–32 位小写字母、数字或 -。");
    expect(screen.getByTestId("external_access_name_save")).toBeDisabled();

    fireEvent.change(input, { target: { value: "office" } });
    expect(screen.queryByTestId("external_access_name_error")).not.toBeInTheDocument();
    expect(screen.getByTestId("external_access_name_save")).toBeEnabled();
  });

  it("保存名称成功后显示成功提示并更新当前名称", async () => {
    getBridgeStatus.mockResolvedValue({ status: "connected", name: "work" });
    rename.mockResolvedValue("ok");
    await renderSection();
    fireEvent.click(await screen.findByTestId("external_access_name_edit"));
    fireEvent.change(await screen.findByTestId("external_access_name_input"), { target: { value: "office" } });
    fireEvent.click(screen.getByTestId("external_access_name_save"));
    await waitFor(() => expect(rename).toHaveBeenCalledWith("office"));
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith("实例名称已更新"));
    expect(await screen.findByTestId("external_access_name_value")).toHaveTextContent("office");
    expect(screen.queryByTestId("external_access_name_input")).not.toBeInTheDocument();
  });

  it("未连接时保存名称提示下次连接生效", async () => {
    getBridgeStatus.mockResolvedValue({ status: "host_unreachable", name: "work" });
    rename.mockResolvedValue("applies-next-connection");
    await renderSection();
    fireEvent.click(await screen.findByTestId("external_access_name_edit"));
    fireEvent.change(await screen.findByTestId("external_access_name_input"), { target: { value: "office" } });
    fireEvent.click(screen.getByTestId("external_access_name_save"));
    await waitFor(() => expect(rename).toHaveBeenCalledWith("office"));
    await waitFor(() => expect(notify.info).toHaveBeenCalledWith("已保存，新名称将在下次连接时生效"));
    expect(await screen.findByTestId("external_access_name_value")).toHaveTextContent("office");
    expect(notify.success).not.toHaveBeenCalled();
  });

  it("保存名称冲突时留在编辑状态并提示名称已被占用", async () => {
    getBridgeStatus.mockResolvedValue({ status: "connected", name: "work" });
    rename.mockResolvedValue("name-taken");
    await renderSection();
    fireEvent.click(await screen.findByTestId("external_access_name_edit"));
    fireEvent.change(await screen.findByTestId("external_access_name_input"), { target: { value: "taken" } });
    fireEvent.click(screen.getByTestId("external_access_name_save"));
    await waitFor(() => expect(rename).toHaveBeenCalledWith("taken"));
    expect(await screen.findByTestId("external_access_name_error")).toHaveTextContent(
      "该名称已被另一个 ScriptCat 实例使用"
    );
    expect(screen.getByTestId("external_access_name_input")).toHaveValue("taken");
    expect(notify.success).not.toHaveBeenCalled();
  });

  it("接入对话框预填当前实例名称，名称不合规时禁用提交", async () => {
    getBridgeStatus.mockResolvedValue({ status: "pending_enrollment", name: "home-browser" });
    await renderSection();
    fireEvent.click(await screen.findByTestId("external_access_enroll_open"));
    const nameInput = await screen.findByTestId("external_access_enroll_name_input");
    expect(nameInput).toHaveValue("home-browser");

    const cell0 = await screen.findByTestId("external_access_enroll_code-cell-0");
    fireEvent.paste(cell0, { clipboardData: { getData: () => "ABCD1234" } });
    fireEvent.change(nameInput, { target: { value: "Home Browser" } });
    expect(await screen.findByTestId("external_access_enroll_name_error")).toHaveTextContent(
      "名称需为 1–32 位小写字母、数字或 -。"
    );
    expect(screen.getByTestId("external_access_enroll_submit")).toBeDisabled();
  });

  it("接入时名称冲突保持对话框打开，提示名称与配对码均不可用并清空配对码", async () => {
    getBridgeStatus.mockResolvedValue({ status: "pending_enrollment", name: "home-browser" });
    enroll.mockResolvedValue("name-taken");
    await renderSection();
    fireEvent.click(await screen.findByTestId("external_access_enroll_open"));
    const cell0 = await screen.findByTestId("external_access_enroll_code-cell-0");
    fireEvent.paste(cell0, { clipboardData: { getData: () => "ABCD1234" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("external_access_enroll_submit"));
    });
    expect(enroll).toHaveBeenCalledWith("ABCD1234", "home-browser");
    const error = await screen.findByTestId("external_access_enroll_name_error");
    expect(error).toHaveTextContent("该名称已被另一个 ScriptCat 实例使用");
    expect(error).toHaveTextContent("这个配对码已用掉");
    expect(screen.getByTestId("external_access_enroll_name_input")).toBeInTheDocument();
    expect(screen.getByTestId("external_access_enroll_code-cell-0")).toHaveValue("");
    expect(screen.getByTestId("external_access_enroll_submit")).toBeDisabled();
    expect(notify.info).not.toHaveBeenCalled();
  });

  it("被 sctl 拒绝（refused）时说明原因并可重新接入", async () => {
    getBridgeStatus.mockResolvedValue({ status: "rejected", reason: "refused", name: "work" });
    await renderSection();
    expect(await screen.findByTestId("external_access_rejected_reason")).toHaveTextContent(
      "sctl 拒绝了这个 ScriptCat 实例"
    );
    fireEvent.click(screen.getByTestId("external_access_reenroll"));
    expect(await screen.findByTestId("external_access_enroll_name_input")).toHaveValue("work");
  });

  it("被 sctl 拒绝（name-taken）时说明冲突并可进入改名", async () => {
    getBridgeStatus.mockResolvedValue({ status: "rejected", reason: "name-taken", name: "work" });
    await renderSection();
    expect(await screen.findByTestId("external_access_rejected_reason")).toHaveTextContent(
      "该名称已被另一个 ScriptCat 实例使用"
    );
    fireEvent.click(screen.getByTestId("external_access_edit_name"));
    expect(await screen.findByTestId("external_access_name_input")).toHaveValue("work");
  });
});
