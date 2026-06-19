// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { initLanguage, t } from "@App/locales/locales";

// 脚本/授权数据走后台消息，统一打桩；用 hoisted 以便在 vi.mock 工厂内引用
const { fetchScript, updateMetadata, setCheckUpdateUrl, resetMatch, resetExclude } = vi.hoisted(() => ({
  fetchScript: vi.fn(),
  updateMetadata: vi.fn(),
  setCheckUpdateUrl: vi.fn(),
  resetMatch: vi.fn(),
  resetExclude: vi.fn(),
}));
const { getScriptPermissions, addPermission, updatePermission, deletePermission, resetPermission } = vi.hoisted(() => ({
  getScriptPermissions: vi.fn(),
  addPermission: vi.fn(),
  updatePermission: vi.fn(),
  deletePermission: vi.fn(),
  resetPermission: vi.fn(),
}));
vi.mock("@App/pages/store/features/script", () => ({
  fetchScript,
  scriptClient: { updateMetadata, setCheckUpdateUrl, resetMatch, resetExclude },
  permissionClient: { getScriptPermissions, addPermission, updatePermission, deletePermission, resetPermission },
}));

import SettingsPane, { invalidateSettingsPane, preloadSettingsPane } from "./SettingsPane";

const sampleScript = () => ({
  uuid: "u1",
  name: "脚本A",
  author: "me",
  origin: "https://example.com/a.user.js",
  checkUpdate: true,
  checkUpdateUrl: "https://example.com/a.meta.js",
  downloadUrl: "https://example.com/a.user.js",
  updatetime: 1_700_000_000_000,
  createtime: 1_690_000_000_000,
  metadata: { version: ["1.0.0"], match: ["*://script.com/*"], exclude: [], tag: ["alpha,beta"] },
  selfMetadata: { match: ["*://script.com/*", "*://user.com/*"], exclude: ["*://exclude.com/*"] },
});

const samplePermissions = () => [
  { uuid: "u1", permission: "cors", permissionValue: "a.com", allow: true, createtime: 1, updatetime: 0 },
  { uuid: "u1", permission: "cookie", permissionValue: "b.com", allow: false, createtime: 2, updatetime: 0 },
];

beforeEach(() => {
  initLanguage("zh-CN");
  vi.clearAllMocks();
  fetchScript.mockResolvedValue(sampleScript());
  getScriptPermissions.mockResolvedValue(samplePermissions());
  updateMetadata.mockResolvedValue(true);
  setCheckUpdateUrl.mockResolvedValue(undefined);
  resetMatch.mockResolvedValue(undefined);
  resetExclude.mockResolvedValue(undefined);
  addPermission.mockResolvedValue(undefined);
  updatePermission.mockResolvedValue(undefined);
  deletePermission.mockResolvedValue(undefined);
  resetPermission.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  invalidateSettingsPane();
});

describe("SettingsPane 基本信息", () => {
  it("预加载后挂载应复用脚本与授权数据", async () => {
    await preloadSettingsPane("u1");
    render(<SettingsPane uuid="u1" />);

    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(fetchScript).toHaveBeenCalledOnce();
    expect(getScriptPermissions).toHaveBeenCalledOnce();
  });

  it("卸载后应清除缓存并在重挂载时刷新授权", async () => {
    const first = render(<SettingsPane uuid="u1" />);
    await screen.findByText("a.com");
    first.unmount();
    getScriptPermissions.mockResolvedValue([]);

    render(<SettingsPane uuid="u1" />);

    await screen.findByText("alpha");
    expect(screen.queryByText("a.com")).toBeNull();
    expect(getScriptPermissions).toHaveBeenCalledTimes(2);
  });

  it("应以彩色标签展示已有标签", async () => {
    render(<SettingsPane uuid="u1" />);
    expect(await screen.findByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
  });

  it("应展示 UUID 与复制按钮", async () => {
    render(<SettingsPane uuid="u1" />);
    await screen.findByText("alpha");
    expect(screen.getByText("u1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("copy") })).toBeInTheDocument();
  });

  it("删除标签应以剩余标签调用 updateMetadata", async () => {
    render(<SettingsPane uuid="u1" />);
    await screen.findByText("alpha");
    fireEvent.click(screen.getByRole("button", { name: `${t("delete")} alpha` }));
    await waitFor(() => expect(updateMetadata).toHaveBeenCalledWith("u1", "tag", ["beta"]));
  });

  it("添加标签后回车应调用 updateMetadata 写入新标签", async () => {
    render(<SettingsPane uuid="u1" />);
    await screen.findByText("alpha");
    const input = screen.getByPlaceholderText(t("script:input_tags_placeholder"));
    fireEvent.change(input, { target: { value: "gamma" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(updateMetadata).toHaveBeenCalledWith("u1", "tag", ["alpha", "beta", "gamma"]));
  });
});

describe("SettingsPane 运行设置", () => {
  it("运行环境的选项应使用本地化文案而非原始英文值", async () => {
    fetchScript.mockResolvedValue({
      ...sampleScript(),
      selfMetadata: { ...sampleScript().selfMetadata, "run-in": ["all"] },
    });
    render(<SettingsPane uuid="u1" />);
    await screen.findByText("alpha");
    // 选中的运行环境应显示本地化「所有标签」，而不是原始的 "all"
    expect(screen.getByText(t("settings:script_run_env.all"))).toBeInTheDocument();
    expect(screen.queryByText("all")).toBeNull();
  });

  it("默认运行环境/运行时机应显示本地化「默认」而非 default", async () => {
    render(<SettingsPane uuid="u1" />);
    await screen.findByText("alpha");
    expect(screen.queryByText("default")).toBeNull();
    // 运行环境与运行时机的默认值均显示本地化「默认」
    expect(screen.getAllByText(t("settings:script_setting.default")).length).toBe(2);
  });
});

describe("SettingsPane 更新URL", () => {
  it("应展示更新URL并在失焦后调用 setCheckUpdateUrl", async () => {
    render(<SettingsPane uuid="u1" />);
    await screen.findByText("alpha");
    const input = screen.getByDisplayValue("https://example.com/a.meta.js");
    fireEvent.change(input, { target: { value: "https://new.example.com/a.meta.js" } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(setCheckUpdateUrl).toHaveBeenCalledWith("u1", true, "https://new.example.com/a.meta.js")
    );
  });
});

describe("SettingsPane 网站匹配/排除", () => {
  it("应以表格展示匹配规则及来源(脚本/用户)", async () => {
    render(<SettingsPane uuid="u1" />);
    expect(await screen.findByText("*://script.com/*")).toBeInTheDocument();
    expect(screen.getByText("*://user.com/*")).toBeInTheDocument();
    expect(screen.getByText("*://exclude.com/*")).toBeInTheDocument();
    // script.com 来自脚本元数据(脚本)，user.com / exclude.com 为用户添加(用户)
    expect(screen.getByText(t("editor:from_script"))).toBeInTheDocument();
    expect(screen.getAllByText(t("editor:from_user")).length).toBe(2);
  });

  it("删除用户匹配应以剩余规则调用 resetMatch", async () => {
    render(<SettingsPane uuid="u1" />);
    await screen.findByText("*://user.com/*");
    fireEvent.click(screen.getByRole("button", { name: `${t("delete")} *://user.com/*` }));
    fireEvent.click(screen.getByRole("button", { name: t("confirm") }));
    await waitFor(() => expect(resetMatch).toHaveBeenCalledWith("u1", ["*://script.com/*"]));
  });

  it("添加匹配:输入保存应调用 resetMatch", async () => {
    render(<SettingsPane uuid="u1" />);
    await screen.findByText("*://script.com/*");
    fireEvent.click(screen.getByRole("button", { name: t("editor:add_match") }));
    fireEvent.change(screen.getByPlaceholderText("*://*.example.com/*"), { target: { value: "*://new.com/*" } });
    fireEvent.click(screen.getByRole("button", { name: t("confirm") }));
    await waitFor(() =>
      expect(resetMatch).toHaveBeenCalledWith("u1", ["*://script.com/*", "*://user.com/*", "*://new.com/*"])
    );
  });

  it("重置匹配应以 undefined 调用 resetMatch", async () => {
    render(<SettingsPane uuid="u1" />);
    await screen.findByText("*://script.com/*");
    // 三个重置按钮按 DOM 顺序：匹配 / 排除 / 授权
    fireEvent.click(screen.getAllByRole("button", { name: t("reset") })[0]);
    fireEvent.click(screen.getByRole("button", { name: t("confirm") }));
    await waitFor(() => expect(resetMatch).toHaveBeenCalledWith("u1", undefined));
  });
});

describe("SettingsPane 授权管理(CORS)", () => {
  it("应以徽标展示 CORS/Cookie 授权", async () => {
    render(<SettingsPane uuid="u1" />);
    expect(await screen.findByText("CORS")).toBeInTheDocument();
    expect(screen.getByText("Cookie")).toBeInTheDocument();
    expect(screen.getByText("a.com")).toBeInTheDocument();
    expect(screen.getByText("b.com")).toBeInTheDocument();
  });

  it("点击是否允许徽标应调用 updatePermission", async () => {
    render(<SettingsPane uuid="u1" />);
    await screen.findByText("a.com");
    fireEvent.click(screen.getByRole("button", { name: `${t("permission:allow")} a.com` }));
    await waitFor(() =>
      expect(updatePermission).toHaveBeenCalledWith(
        expect.objectContaining({ permission: "cors", permissionValue: "a.com", allow: false })
      )
    );
  });

  it("删除授权应调用 deletePermission 并移除该行", async () => {
    render(<SettingsPane uuid="u1" />);
    await screen.findByText("a.com");
    fireEvent.click(screen.getByRole("button", { name: `${t("delete")} a.com` }));
    fireEvent.click(screen.getByRole("button", { name: t("confirm") }));
    await waitFor(() => expect(deletePermission).toHaveBeenCalledWith("u1", "cors", "a.com"));
    await waitFor(() => expect(screen.queryByText("a.com")).toBeNull());
  });

  it("新增授权:填值保存应调用 addPermission", async () => {
    render(<SettingsPane uuid="u1" />);
    await screen.findByText("a.com");
    fireEvent.click(screen.getByRole("button", { name: t("editor:add_permission") }));
    fireEvent.change(screen.getByPlaceholderText(t("permission:permission_value")), { target: { value: "c.com" } });
    fireEvent.click(screen.getByRole("button", { name: t("confirm") }));
    await waitFor(() =>
      expect(addPermission).toHaveBeenCalledWith(
        expect.objectContaining({ uuid: "u1", permission: "cors", permissionValue: "c.com" })
      )
    );
  });

  it("重置授权应调用 resetPermission 并清空列表", async () => {
    render(<SettingsPane uuid="u1" />);
    await screen.findByText("a.com");
    // 第三个重置按钮为授权管理
    fireEvent.click(screen.getAllByRole("button", { name: t("reset") })[2]);
    fireEvent.click(screen.getByRole("button", { name: t("confirm") }));
    await waitFor(() => expect(resetPermission).toHaveBeenCalledWith("u1"));
    await waitFor(() => expect(screen.queryByText("a.com")).toBeNull());
  });

  it("无授权时应展示空状态", async () => {
    getScriptPermissions.mockResolvedValue([]);
    render(<SettingsPane uuid="u1" />);
    await screen.findByText("alpha");
    expect(screen.getByText(t("permission:permission_management"))).toBeInTheDocument();
    expect(screen.getByText(t("no_data"))).toBeInTheDocument();
  });
});
