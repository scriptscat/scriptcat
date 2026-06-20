// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { initLanguage } from "@App/locales/locales";
import type { ConfirmParam } from "@App/app/service/service_worker/permission_verify";

// 授权数据走后台消息，统一打桩
const { getPermissionInfo, confirm, isMobile } = vi.hoisted(() => ({
  getPermissionInfo: vi.fn(),
  confirm: vi.fn(),
  isMobile: { value: false },
}));
vi.mock("@App/pages/store/features/script", () => ({
  permissionClient: { getPermissionInfo, confirm },
}));
// 单一移动断点来源，按需切换桌面/移动外壳
vi.mock("@App/pages/components/use-is-mobile", () => ({
  useIsMobile: () => isMobile.value,
  MOBILE_BREAKPOINT: 768,
}));

import { PermissionConfirm } from "./App";

const baseInfo = (over: Partial<ConfirmParam> = {}, likeNum = 0) => ({
  script: { uuid: "u1", name: "Bilibili 视频下载助手", metadata: { version: ["1.2.0"] } },
  confirm: {
    permission: "cors",
    permissionValue: "api.bilibili.com",
    title: "脚本正在试图访问跨域资源",
    describe: "请确认是否允许该脚本访问跨域资源。",
    wildcard: true,
    permissionContent: "域名",
    metadata: {
      脚本名称: "Bilibili 视频下载助手",
      请求域名: "api.bilibili.com",
      请求地址: "https://api.bilibili.com/x/player/playurl",
    },
    ...over,
  } as ConfirmParam,
  likeNum,
});

beforeEach(() => {
  initLanguage("zh-CN");
  vi.clearAllMocks();
  vi.spyOn(window, "close").mockImplementation(() => {});
  confirm.mockResolvedValue(undefined);
  isMobile.value = false;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("授权确认页 · 渲染", () => {
  it("加载后应展示标题、描述与请求域名", async () => {
    getPermissionInfo.mockResolvedValue(baseInfo());
    render(<PermissionConfirm uuid="u1" />);
    expect(await screen.findByText("脚本正在试图访问跨域资源")).toBeInTheDocument();
    expect(screen.getByText("请确认是否允许该脚本访问跨域资源。")).toBeInTheDocument();
    expect(screen.getByText("api.bilibili.com")).toBeInTheDocument();
  });

  it("脚本名应只出现在身份行，不在请求信息中重复", async () => {
    getPermissionInfo.mockResolvedValue(baseInfo());
    render(<PermissionConfirm uuid="u1" />);
    await screen.findByText("脚本正在试图访问跨域资源");
    // 身份行展示脚本名，但 metadata 的「脚本名称」标签不应再次出现
    expect(screen.getByText("Bilibili 视频下载助手")).toBeInTheDocument();
    expect(screen.queryByText("脚本名称")).not.toBeInTheDocument();
  });

  it("页头左上角应渲染真实 logo 图片(而非占位字母块)", async () => {
    getPermissionInfo.mockResolvedValue(baseInfo());
    render(<PermissionConfirm uuid="u1" />);
    const logo = await screen.findByAltText("ScriptCat");
    expect(logo.tagName).toBe("IMG");
    expect(logo.getAttribute("src")).toContain("assets/logo.png");
  });
});

describe("授权确认页 · 时长与范围映射", () => {
  it("默认时长为「仅此次」，点击允许应以 type 1 确认", async () => {
    getPermissionInfo.mockResolvedValue(baseInfo());
    render(<PermissionConfirm uuid="u1" />);
    fireEvent.click(await screen.findByRole("button", { name: "允许" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith("u1", { allow: true, type: 1 }));
  });

  it("选择「永久」后点击允许应以 type 5 确认", async () => {
    getPermissionInfo.mockResolvedValue(baseInfo());
    render(<PermissionConfirm uuid="u1" />);
    fireEvent.click(await screen.findByRole("button", { name: "永久" }));
    fireEvent.click(screen.getByRole("button", { name: "允许" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith("u1", { allow: true, type: 5 }));
  });

  it("通配权限且 likeNum>2 时，开启通配并选永久，允许应为 type 4", async () => {
    getPermissionInfo.mockResolvedValue(baseInfo({ wildcard: true }, 3));
    render(<PermissionConfirm uuid="u1" />);
    fireEvent.click(await screen.findByRole("button", { name: "永久" }));
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "允许" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith("u1", { allow: true, type: 4 }));
  });

  it("点击拒绝应以当前时长 type 确认 allow=false", async () => {
    getPermissionInfo.mockResolvedValue(baseInfo());
    render(<PermissionConfirm uuid="u1" />);
    fireEvent.click(await screen.findByRole("button", { name: "拒绝" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith("u1", { allow: false, type: 1 }));
  });

  it("点击忽略应以 type 0 确认（忽略不留授权记录）", async () => {
    getPermissionInfo.mockResolvedValue(baseInfo());
    render(<PermissionConfirm uuid="u1" />);
    await screen.findByText("脚本正在试图访问跨域资源");
    fireEvent.click(screen.getByRole("button", { name: /忽略/ }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith("u1", { allow: false, type: 0 }));
  });
});

describe("授权确认页 · 选项可见性", () => {
  it("通配权限但 likeNum≤2 时不显示通配开关", async () => {
    getPermissionInfo.mockResolvedValue(baseInfo({ wildcard: true }, 2));
    render(<PermissionConfirm uuid="u1" />);
    await screen.findByText("脚本正在试图访问跨域资源");
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("persistentOnly 权限不展示「临时」选项", async () => {
    getPermissionInfo.mockResolvedValue(baseInfo({ persistentOnly: true, wildcard: false }));
    render(<PermissionConfirm uuid="u1" />);
    await screen.findByText("脚本正在试图访问跨域资源");
    expect(screen.getByRole("button", { name: "仅此次" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "永久" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "临时" })).not.toBeInTheDocument();
  });

  it("cookie 权限应展示高敏感警示", async () => {
    getPermissionInfo.mockResolvedValue(
      baseInfo({ permission: "cookie", title: "脚本正在试图访问网站 Cookie", wildcard: false })
    );
    render(<PermissionConfirm uuid="u1" />);
    expect(await screen.findByText("高敏感权限")).toBeInTheDocument();
  });
});

describe("授权确认页 · 站点访问变体", () => {
  it("仅展示「请求权限」单按钮，不展示时长选择与允许/拒绝", async () => {
    getPermissionInfo.mockResolvedValue(
      baseInfo({ permission: "extension-site-access", title: "ScriptCat 需要站点访问权限", wildcard: false })
    );
    render(<PermissionConfirm uuid="u1" />);
    expect(await screen.findByRole("button", { name: "请求权限" })).toBeInTheDocument();
    expect(screen.queryByText("授权时长")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "允许" })).not.toBeInTheDocument();
  });

  it("点击请求权限应先申请站点访问再以 type 1 确认", async () => {
    const requestSpy = vi.spyOn(chrome.permissions, "request").mockResolvedValue(true as never);
    getPermissionInfo.mockResolvedValue(
      baseInfo({
        permission: "extension-site-access",
        title: "ScriptCat 需要站点访问权限",
        wildcard: false,
        extensionSiteAccessOrigins: ["https://example.com/*"],
      })
    );
    render(<PermissionConfirm uuid="u1" />);
    fireEvent.click(await screen.findByRole("button", { name: "请求权限" }));
    await waitFor(() => expect(requestSpy).toHaveBeenCalledWith({ origins: ["https://example.com/*"] }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith("u1", { allow: true, type: 1 }));
  });
});

describe("授权确认页 · 移动外壳", () => {
  it("桌面下允许/拒绝按钮应横向排列", async () => {
    getPermissionInfo.mockResolvedValue(baseInfo());
    render(<PermissionConfirm uuid="u1" />);
    const row = await screen.findByTestId("confirm-button-row");
    expect(row.className).toContain("flex-row");
    expect(row.className).not.toContain("flex-col");
  });

  it("移动端下允许/拒绝按钮应纵向堆叠", async () => {
    isMobile.value = true;
    getPermissionInfo.mockResolvedValue(baseInfo());
    render(<PermissionConfirm uuid="u1" />);
    const row = await screen.findByTestId("confirm-button-row");
    expect(row.className).toContain("flex-col");
    expect(row.className).not.toContain("flex-row");
  });
});

describe("授权确认页 · 倒计时", () => {
  it("倒计时归零应以忽略(type 0)自动关闭", async () => {
    vi.useFakeTimers();
    getPermissionInfo.mockResolvedValue(baseInfo());
    render(<PermissionConfirm uuid="u1" />);
    // 等待数据加载（promise microtask）
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(31000);
    });
    expect(confirm).toHaveBeenCalledWith("u1", { allow: false, type: 0 });
  });
});
