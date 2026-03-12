import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import React from "react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// mock permissionClient（原有 confirm 流程依赖，chrome_permission 模式不需要）
vi.mock("@App/pages/store/features/script", () => ({
  permissionClient: {
    getPermissionInfo: vi.fn(),
    confirm: vi.fn(),
  },
}));

// mock chrome.permissions.request 和 chrome.runtime.sendMessage
const mockPermissionsRequest = vi.fn();
const mockSendMessage = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();

  (chrome as any).permissions = {
    request: mockPermissionsRequest,
  };
  (chrome.runtime as any).sendMessage = mockSendMessage;
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

// 动态 import 以便 mock 生效
async function renderApp(search: string) {
  // 模拟 location.search
  Object.defineProperty(window, "location", {
    value: { search, href: `https://ext/confirm.html${search}` },
    writable: true,
    configurable: true,
  });

  // 每次重新 import 确保使用最新的 location
  const { default: App } = await import("@App/pages/confirm/App");
  return render(<App />);
}

describe("ChromePermissionRequest", () => {
  it("应显示权限请求 UI", async () => {
    await renderApp("?mode=chrome_permission&permission=debugger&uuid=test-uuid");

    expect(screen.getByText("chrome_permission_title")).toBeInTheDocument();
    expect(screen.getByText("chrome_permission_debugger_desc")).toBeInTheDocument();
    expect(screen.getByText("chrome_permission_grant")).toBeInTheDocument();
    // deny 按钮带倒计时
    expect(screen.getByText("chrome_permission_deny (30)")).toBeInTheDocument();
  });

  it("点击 Grant 应请求权限并发送成功消息", async () => {
    mockPermissionsRequest.mockResolvedValue(true);
    const closeSpy = vi.fn();
    window.close = closeSpy;

    await renderApp("?mode=chrome_permission&permission=debugger&uuid=grant-uuid");

    const grantBtn = screen.getByText("chrome_permission_grant");
    await act(async () => {
      fireEvent.click(grantBtn);
    });

    expect(mockPermissionsRequest).toHaveBeenCalledWith({
      permissions: ["debugger"],
    });
    expect(mockSendMessage).toHaveBeenCalledWith({
      type: "chrome_permission_result",
      uuid: "grant-uuid",
      granted: true,
    });
  });

  it("点击 Grant 但权限被浏览器拒绝时应发送 false", async () => {
    mockPermissionsRequest.mockResolvedValue(false);
    window.close = vi.fn();

    await renderApp("?mode=chrome_permission&permission=debugger&uuid=reject-uuid");

    const grantBtn = screen.getByText("chrome_permission_grant");
    await act(async () => {
      fireEvent.click(grantBtn);
    });

    expect(mockSendMessage).toHaveBeenCalledWith({
      type: "chrome_permission_result",
      uuid: "reject-uuid",
      granted: false,
    });
  });

  it("点击 Deny 应发送拒绝消息", async () => {
    window.close = vi.fn();

    await renderApp("?mode=chrome_permission&permission=debugger&uuid=deny-uuid");

    // deny 按钮文字包含倒计时
    const denyBtn = screen.getByText("chrome_permission_deny (30)");
    await act(async () => {
      fireEvent.click(denyBtn);
    });

    expect(mockSendMessage).toHaveBeenCalledWith({
      type: "chrome_permission_result",
      uuid: "deny-uuid",
      granted: false,
    });
  });

  it("倒计时结束应自动发送拒绝并关闭", async () => {
    const closeSpy = vi.fn();
    window.close = closeSpy;

    await renderApp("?mode=chrome_permission&permission=debugger&uuid=timeout-uuid");

    // 快进 30 秒
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });

    expect(mockSendMessage).toHaveBeenCalledWith({
      type: "chrome_permission_result",
      uuid: "timeout-uuid",
      granted: false,
    });
  });

  it("倒计时数字应递减", async () => {
    await renderApp("?mode=chrome_permission&permission=debugger&uuid=tick-uuid");

    expect(screen.getByText("chrome_permission_deny (30)")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(screen.getByText("chrome_permission_deny (29)")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(screen.getByText("chrome_permission_deny (28)")).toBeInTheDocument();
  });

  it("不应重复发送结果（防止 beforeunload + 按钮双触发）", async () => {
    mockPermissionsRequest.mockResolvedValue(true);
    window.close = vi.fn();

    await renderApp("?mode=chrome_permission&permission=debugger&uuid=dup-uuid");

    // 点击 Grant
    const grantBtn = screen.getByText("chrome_permission_grant");
    await act(async () => {
      fireEvent.click(grantBtn);
    });

    expect(mockSendMessage).toHaveBeenCalledTimes(1);

    // 触发 beforeunload
    fireEvent(window, new Event("beforeunload"));

    // 不应再次发送
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });
});
