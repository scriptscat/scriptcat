import { initTestEnv } from "@Tests/utils";
import { VSCodeConnect, type VSCodeConnectParam } from "./vscode-connect";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { MockMessage } from "@Packages/message/mock_message";
import { Server } from "@Packages/message/server";
import EventEmitter from "eventemitter3";
import { v5 as uuidv5 } from "uuid";

initTestEnv();

// ────────────────────────────────────────────────
// Mock WebSocket
// ────────────────────────────────────────────────

type WSReadyState = 0 | 1 | 2 | 3;

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState: WSReadyState = MockWebSocket.CONNECTING;
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  readonly url: string;
  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    // 模拟异步触发 onclose
    setTimeout(() => this.onclose?.(new CloseEvent("close")), 0);
  }

  // ── 测试辅助方法 ──

  /** 模拟连接成功 */
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  /** 模拟收到消息 */
  simulateMessage(data: unknown) {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(data) }));
  }

  /** 模拟连接关闭 */
  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent("close"));
  }

  /** 模拟错误 */
  simulateError() {
    this.onerror?.(new Event("error"));
  }
}

// 跟踪所有创建的 WebSocket 实例
let wsInstances: MockWebSocket[] = [];

// ────────────────────────────────────────────────
// 测试套件
// ────────────────────────────────────────────────

describe("VSCodeConnect", () => {
  let vscodeConnect: VSCodeConnect;
  let mockInstallByCode: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    wsInstances = [];

    // Mock WebSocket 构造函数
    vi.stubGlobal(
      "WebSocket",
      Object.assign(
        function (url: string) {
          const ws = new MockWebSocket(url);
          wsInstances.push(ws);
          return ws;
        },
        { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }
      )
    );

    // 设置消息服务
    const ee = new EventEmitter<string, any>();
    const mockMessage = new MockMessage(ee);
    const server = new Server("offscreen", mockMessage);
    const group = server.group("vscodeConnect");

    // Mock ScriptClient.installByCode
    mockInstallByCode = vi.fn().mockResolvedValue(undefined);

    vscodeConnect = new VSCodeConnect(group, mockMessage);
    // 替换内部 scriptClient
    (vscodeConnect as any).scriptClient = { installByCode: mockInstallByCode };
    vscodeConnect.init();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /** 触发 connect 消息并返回创建的 WebSocket 实例 */
  function triggerConnect(params?: Partial<VSCodeConnectParam>): MockWebSocket {
    const defaultParams: VSCodeConnectParam = {
      url: "ws://localhost:8642",
      reconnect: true,
      ...params,
    };
    // 直接调用 messageGroup handler
    (vscodeConnect as any).startSession(defaultParams);
    return wsInstances[wsInstances.length - 1];
  }

  // ────────────────────────────────────────────────
  // 连接建立
  // ────────────────────────────────────────────────

  describe("连接建立", () => {
    it("应该创建 WebSocket 连接", () => {
      const ws = triggerConnect({ url: "ws://localhost:9999" });
      expect(ws).toBeDefined();
      expect(ws.url).toBe("ws://localhost:9999");
    });

    it("连接成功后应发送 hello 握手消息", () => {
      const ws = triggerConnect();
      ws.simulateOpen();

      expect(ws.sentMessages).toHaveLength(1);
      expect(JSON.parse(ws.sentMessages[0])).toEqual({ action: "hello" });
    });

    it("连接成功后应重置重连延迟", () => {
      const ws = triggerConnect();
      // 先设置较大的延迟
      (vscodeConnect as any).reconnectDelay = 5000;
      ws.simulateOpen();

      expect((vscodeConnect as any).reconnectDelay).toBe(1000);
    });
  });

  // ────────────────────────────────────────────────
  // 消息处理
  // ────────────────────────────────────────────────

  describe("消息处理", () => {
    it("收到 onchange 消息应安装脚本", async () => {
      const ws = triggerConnect();
      ws.simulateOpen();

      const uri = "file:///home/user/test.user.js";
      const script = "// ==UserScript==\n// @name Test\n// ==/UserScript==";

      ws.simulateMessage({
        action: "onchange",
        data: { script, uri },
      });

      // 等待异步操作完成
      await vi.advanceTimersByTimeAsync(0);

      const expectedUuid = uuidv5(uri, uuidv5.URL);
      expect(mockInstallByCode).toHaveBeenCalledWith(expectedUuid, script, "vscode");
    });

    it("onchange 消息缺少 script 时不应安装", async () => {
      const ws = triggerConnect();
      ws.simulateOpen();

      ws.simulateMessage({
        action: "onchange",
        data: { uri: "file:///test.user.js" },
      });

      await vi.advanceTimersByTimeAsync(0);
      expect(mockInstallByCode).not.toHaveBeenCalled();
    });

    it("onchange 消息缺少 uri 时不应安装", async () => {
      const ws = triggerConnect();
      ws.simulateOpen();

      ws.simulateMessage({
        action: "onchange",
        data: { script: "// some script" },
      });

      await vi.advanceTimersByTimeAsync(0);
      expect(mockInstallByCode).not.toHaveBeenCalled();
    });

    it("相同 URI 应生成相同的 stableId", async () => {
      const ws = triggerConnect();
      ws.simulateOpen();

      const uri = "file:///home/user/stable.user.js";
      const script1 = "// version 1";
      const script2 = "// version 2";

      ws.simulateMessage({ action: "onchange", data: { script: script1, uri } });
      await vi.advanceTimersByTimeAsync(0);

      ws.simulateMessage({ action: "onchange", data: { script: script2, uri } });
      await vi.advanceTimersByTimeAsync(0);

      expect(mockInstallByCode).toHaveBeenCalledTimes(2);
      const uuid1 = mockInstallByCode.mock.calls[0][0];
      const uuid2 = mockInstallByCode.mock.calls[1][0];
      expect(uuid1).toBe(uuid2);
    });

    it("不同 URI 应生成不同的 stableId", async () => {
      const ws = triggerConnect();
      ws.simulateOpen();

      ws.simulateMessage({
        action: "onchange",
        data: { script: "// s1", uri: "file:///a.user.js" },
      });
      await vi.advanceTimersByTimeAsync(0);

      ws.simulateMessage({
        action: "onchange",
        data: { script: "// s2", uri: "file:///b.user.js" },
      });
      await vi.advanceTimersByTimeAsync(0);

      const uuid1 = mockInstallByCode.mock.calls[0][0];
      const uuid2 = mockInstallByCode.mock.calls[1][0];
      expect(uuid1).not.toBe(uuid2);
    });

    it("收到无法解析的消息不应抛出异常", () => {
      const ws = triggerConnect();
      ws.simulateOpen();

      // 发送非 JSON 消息
      expect(() => {
        ws.onmessage?.(new MessageEvent("message", { data: "not json" }));
      }).not.toThrow();
    });

    it("收到未知 action 不应抛出异常", () => {
      const ws = triggerConnect();
      ws.simulateOpen();

      expect(() => {
        ws.simulateMessage({ action: "unknown_action" });
      }).not.toThrow();
    });
  });

  // ────────────────────────────────────────────────
  // 连接超时
  // ────────────────────────────────────────────────

  describe("连接超时", () => {
    it("30 秒内未连接成功应关闭 WebSocket", () => {
      const ws = triggerConnect();
      const closeSpy = vi.spyOn(ws, "close");

      // 快进 30 秒
      vi.advanceTimersByTime(30_000);

      expect(closeSpy).toHaveBeenCalled();
    });

    it("连接成功后超时计时器应被清除", () => {
      const ws = triggerConnect();
      ws.simulateOpen();

      expect((vscodeConnect as any).connectTimeoutTimer).toBeNull();
    });
  });

  // ────────────────────────────────────────────────
  // 自动重连
  // ────────────────────────────────────────────────

  describe("自动重连", () => {
    it("连接关闭后应自动重连（reconnect=true）", () => {
      const ws = triggerConnect({ reconnect: true });
      ws.simulateOpen();
      ws.simulateClose();

      // 在重连延迟后应创建新的 WebSocket
      vi.advanceTimersByTime(1000);
      expect(wsInstances).toHaveLength(2);
    });

    it("reconnect=false 时不应自动重连", () => {
      const ws = triggerConnect({ reconnect: false });
      ws.simulateOpen();
      ws.simulateClose();

      vi.advanceTimersByTime(30_000);
      expect(wsInstances).toHaveLength(1);
    });

    it("重连延迟应指数递增（最大 10 秒）", () => {
      const ws1 = triggerConnect({ reconnect: true });
      ws1.simulateClose();

      // 第一次重连：1000ms
      vi.advanceTimersByTime(1000);
      expect(wsInstances).toHaveLength(2);

      // 第二次：1500ms (1000 * 1.5)
      wsInstances[1].simulateClose();
      vi.advanceTimersByTime(1500);
      expect(wsInstances).toHaveLength(3);

      // 第三次：2250ms (1500 * 1.5)
      wsInstances[2].simulateClose();
      vi.advanceTimersByTime(2250);
      expect(wsInstances).toHaveLength(4);
    });

    it("重连成功后应重置延迟", () => {
      const ws1 = triggerConnect({ reconnect: true });
      ws1.simulateClose();

      // 第一次重连
      vi.advanceTimersByTime(1000);
      const ws2 = wsInstances[1];
      ws2.simulateOpen(); // 连接成功，重置延迟

      expect((vscodeConnect as any).reconnectDelay).toBe(1000);
    });

    it("错误后也应触发重连", () => {
      const ws = triggerConnect({ reconnect: true });
      ws.simulateError();

      vi.advanceTimersByTime(1000);
      expect(wsInstances).toHaveLength(2);
    });

    it("error + close 不应触发双重重连", () => {
      const ws = triggerConnect({ reconnect: true });
      // error 和 close 连续触发（浏览器通常如此）
      ws.simulateError();
      ws.simulateClose();

      vi.advanceTimersByTime(1000);
      // 只应有一次重连
      expect(wsInstances).toHaveLength(2);
    });
  });

  // ────────────────────────────────────────────────
  // Epoch 机制（防止旧连接干扰）
  // ────────────────────────────────────────────────

  describe("Epoch 机制", () => {
    it("新连接请求应使旧连接的事件失效", async () => {
      const ws1 = triggerConnect();
      ws1.simulateOpen();

      // 发起新连接
      const ws2 = triggerConnect();
      ws2.simulateOpen();

      // 旧连接收到消息不应处理
      ws1.simulateMessage({
        action: "onchange",
        data: { script: "// old", uri: "file:///old.user.js" },
      });
      await vi.advanceTimersByTimeAsync(0);

      expect(mockInstallByCode).not.toHaveBeenCalled();

      // 新连接收到消息应正常处理
      ws2.simulateMessage({
        action: "onchange",
        data: { script: "// new", uri: "file:///new.user.js" },
      });
      await vi.advanceTimersByTimeAsync(0);

      expect(mockInstallByCode).toHaveBeenCalledTimes(1);
    });

    it("新连接请求应取消旧连接的重连计时器", () => {
      const ws1 = triggerConnect({ reconnect: true });
      ws1.simulateClose();

      // 重连计时器在等待中，此时发起新连接
      triggerConnect({ url: "ws://new-url:8642", reconnect: true });

      // 等待旧的重连延迟，不应该使用旧 URL 重连
      vi.advanceTimersByTime(1000);
      // 第一次 triggerConnect 创建 ws1, 第二次 triggerConnect 创建 ws2
      // 不应创建第三个（旧的重连）
      expect(wsInstances).toHaveLength(2);
      expect(wsInstances[1].url).toBe("ws://new-url:8642");
    });
  });

  // ────────────────────────────────────────────────
  // 资源清理
  // ────────────────────────────────────────────────

  describe("资源清理", () => {
    it("新连接应关闭旧的 WebSocket", () => {
      const ws1 = triggerConnect();
      ws1.simulateOpen();
      const closeSpy = vi.spyOn(ws1, "close");

      triggerConnect();

      expect(closeSpy).toHaveBeenCalled();
    });

    it("新连接应清除旧 WebSocket 的事件监听", () => {
      const ws1 = triggerConnect();
      ws1.simulateOpen();

      triggerConnect();

      expect(ws1.onopen).toBeNull();
      expect(ws1.onclose).toBeNull();
      expect(ws1.onmessage).toBeNull();
      expect(ws1.onerror).toBeNull();
    });
  });
});
