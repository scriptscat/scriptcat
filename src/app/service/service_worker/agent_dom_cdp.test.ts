import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ensureDebuggerPermission } from "./agent_dom_cdp";

// mock openInCurrentTab
vi.mock("@App/pkg/utils/utils", () => ({
  openInCurrentTab: vi.fn(),
}));

import { openInCurrentTab } from "@App/pkg/utils/utils";

// mock chrome.permissions
const mockPermissionsContains = vi.fn();

// mock chrome.runtime.onMessage（支持 addListener / removeListener）
let messageListeners: Array<(msg: any, sender: any, sendResponse: any) => any> = [];
const mockOnMessage = {
  addListener: vi.fn((cb: any) => {
    messageListeners.push(cb);
  }),
  removeListener: vi.fn((cb: any) => {
    messageListeners = messageListeners.filter((l) => l !== cb);
  }),
};

// mock crypto.randomUUID
const MOCK_UUID = "test-uuid-1234";

beforeEach(() => {
  vi.clearAllMocks();
  messageListeners = [];

  (chrome as any).permissions = {
    contains: mockPermissionsContains,
  };
  (chrome.runtime as any).onMessage = mockOnMessage;

  vi.stubGlobal("crypto", {
    randomUUID: () => MOCK_UUID,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// 等待微任务队列刷新，让 async 代码执行完毕
const flushMicrotasks = () => new Promise<void>((r) => setTimeout(r, 0));

describe("ensureDebuggerPermission", () => {
  it("权限已授予时直接返回", async () => {
    mockPermissionsContains.mockResolvedValue(true);

    await ensureDebuggerPermission();

    expect(mockPermissionsContains).toHaveBeenCalledWith({ permissions: ["debugger"] });
    expect(openInCurrentTab).not.toHaveBeenCalled();
    expect(mockOnMessage.addListener).not.toHaveBeenCalled();
  });

  it("权限未授予时打开确认页面并等待用户授权", async () => {
    mockPermissionsContains.mockResolvedValue(false);

    const promise = ensureDebuggerPermission();

    // 等待 contains() 的 Promise resolve 后才会执行后续代码
    await flushMicrotasks();

    // 验证打开了确认页面
    expect(openInCurrentTab).toHaveBeenCalledWith(
      `src/confirm.html?mode=chrome_permission&permission=debugger&uuid=${MOCK_UUID}`
    );
    // 验证注册了消息监听
    expect(mockOnMessage.addListener).toHaveBeenCalledTimes(1);
    expect(messageListeners).toHaveLength(1);

    // 模拟用户授权
    const sendResponse = vi.fn();
    messageListeners[0]({ type: "chrome_permission_result", uuid: MOCK_UUID, granted: true }, {}, sendResponse);

    await promise;

    expect(sendResponse).toHaveBeenCalledWith(true);
    // 监听器应该已被移除
    expect(mockOnMessage.removeListener).toHaveBeenCalled();
  });

  it("用户拒绝权限时应 reject", async () => {
    mockPermissionsContains.mockResolvedValue(false);

    const promise = ensureDebuggerPermission();
    await flushMicrotasks();

    // 模拟用户拒绝
    const sendResponse = vi.fn();
    messageListeners[0]({ type: "chrome_permission_result", uuid: MOCK_UUID, granted: false }, {}, sendResponse);

    await expect(promise).rejects.toThrow("Debugger permission denied by user");
    expect(mockOnMessage.removeListener).toHaveBeenCalled();
  });

  it("超时时应 reject", async () => {
    vi.useFakeTimers();
    mockPermissionsContains.mockResolvedValue(false);

    const promise = ensureDebuggerPermission();
    await vi.advanceTimersByTimeAsync(0); // flush microtasks

    expect(messageListeners).toHaveLength(1);

    // 快进 60 秒
    await vi.advanceTimersByTimeAsync(60000);

    await expect(promise).rejects.toThrow("Permission request timed out");
    expect(mockOnMessage.removeListener).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("应忽略不匹配的消息", async () => {
    mockPermissionsContains.mockResolvedValue(false);

    const promise = ensureDebuggerPermission();
    await flushMicrotasks();

    // 发送不匹配的消息（错误的 type）
    const sendResponse1 = vi.fn();
    const result1 = messageListeners[0]({ type: "other_message", uuid: MOCK_UUID }, {}, sendResponse1);
    expect(result1).toBeUndefined();
    expect(sendResponse1).not.toHaveBeenCalled();

    // 发送不匹配的消息（错误的 uuid）
    const sendResponse2 = vi.fn();
    const result2 = messageListeners[0]({ type: "chrome_permission_result", uuid: "wrong-uuid" }, {}, sendResponse2);
    expect(result2).toBeUndefined();
    expect(sendResponse2).not.toHaveBeenCalled();

    // 监听器不应被移除
    expect(mockOnMessage.removeListener).not.toHaveBeenCalled();

    // 最终发送正确的消息来 resolve promise
    const sendResponse3 = vi.fn();
    messageListeners[0]({ type: "chrome_permission_result", uuid: MOCK_UUID, granted: true }, {}, sendResponse3);

    await promise;
  });
});
