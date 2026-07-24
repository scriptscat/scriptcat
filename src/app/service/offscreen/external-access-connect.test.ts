import { initTestEnv } from "@Tests/utils";
import {
  ExternalAccessConnect,
  bytesToHex,
  computeHandshakeHmac,
  constantTimeEqualHex,
  decryptLongTermKey,
  derivePairingKeys,
  hexToBytes,
  normalizePairingCode,
  randomNonceHex,
  utf8Bytes,
  type ExternalAccessConnectParam,
} from "./external-access-connect";
import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { MockMessage } from "@Packages/message/mock_message";
import { Server } from "@Packages/message/server";
import EventEmitter from "eventemitter3";
import { createCipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import protocol from "../service_worker/external_access/protocol.json";

initTestEnv();

const CTX = protocol.crypto.context;

// ────────────────────────────────────────────────
// 独立参照实现（node:crypto）——同时充当 daemon 模拟器，钉住线格式与 sctl 互操作
// ────────────────────────────────────────────────

function nodeHmacHex(keyBytes: Uint8Array, context: string, a: string, b: string): string {
  return createHmac("sha256", Buffer.from(keyBytes))
    .update(context + a + b)
    .digest("hex");
}

function nodePairingKeys(code: string): { mac: Buffer; enc: Buffer } {
  const ikm = Buffer.from(normalizePairingCode(code), "utf8");
  const salt = Buffer.from(CTX.pairKdfSalt, "utf8");
  const mac = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from(CTX.pairKdfInfoMac, "utf8"), 32));
  const enc = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from(CTX.pairKdfInfoEnc, "utf8"), 32));
  return { mac, enc };
}

function nodeEncryptKey(encKey: Buffer, plaintext: Buffer): { ciphertext: string; iv: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encKey, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([ct, tag]).toString("base64"), iv: iv.toString("base64") };
}

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
    setTimeout(() => this.onclose?.(new CloseEvent("close")), 0);
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  simulateMessage(data: unknown) {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(data) }));
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent("close"));
  }

  simulateError() {
    this.onerror?.(new Event("error"));
  }

  /** 返回第 index 个已发送信封（解析后） */
  sent(index: number): any {
    return JSON.parse(this.sentMessages[index]);
  }
}

let wsInstances: MockWebSocket[] = [];

function stubWebSocket() {
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
}

// ────────────────────────────────────────────────

describe("ExternalAccessConnect", () => {
  // 握手用例走真实 WebCrypto（HKDF/HMAC/AES-GCM），比纯逻辑用例重；在满载并行下会超出 fast
  // 项目默认的 340ms 预算，故为本文件放宽超时（真实互操作向量不宜用 mock 替换）。
  beforeAll(() => vi.setConfig({ testTimeout: 5000 }));

  let externalAccessConnect: ExternalAccessConnect;
  let relay: {
    envelope: ReturnType<typeof vi.fn>;
    paired: ReturnType<typeof vi.fn>;
    disconnected: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    wsInstances = [];
    stubWebSocket();

    const ee = new EventEmitter<string, any>();
    const mockMessage = new MockMessage(ee);
    const server = new Server("offscreen", mockMessage);
    const group = server.group("externalAccessConnect");

    externalAccessConnect = new ExternalAccessConnect(group, mockMessage);
    relay = {
      envelope: vi.fn().mockResolvedValue(undefined),
      paired: vi.fn().mockResolvedValue(undefined),
      disconnected: vi.fn().mockResolvedValue(undefined),
    };
    (externalAccessConnect as any).relay = relay;
    externalAccessConnect.init();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function triggerConnect(param: ExternalAccessConnectParam): MockWebSocket {
    (externalAccessConnect as any).startSession(param);
    return wsInstances[wsInstances.length - 1];
  }

  const sessionParam = (key: string): ExternalAccessConnectParam => ({
    url: "ws://127.0.0.1:8643",
    auth: { mode: "session", key },
  });

  // ────────────────────────────────────────────────
  describe("WebCrypto 握手原语", () => {
    it("computeHandshakeHmac 与 node:crypto 参照实现逐字节一致", async () => {
      const key = randomBytes(32);
      const nonceD = randomBytes(32).toString("hex");
      const nonceE = randomBytes(32).toString("hex");
      const got = await computeHandshakeHmac(new Uint8Array(key), CTX.sessionExt, nonceD, nonceE);
      expect(got).toBe(nodeHmacHex(new Uint8Array(key), CTX.sessionExt, nonceD, nonceE));
    });

    it("derivePairingKeys 的 HKDF 输出与 node:crypto 参照实现一致", async () => {
      const { mac, enc } = await derivePairingKeys("ABCD-2345");
      const ref = nodePairingKeys("ABCD-2345");
      expect(bytesToHex(mac)).toBe(ref.mac.toString("hex"));
      expect(bytesToHex(enc)).toBe(ref.enc.toString("hex"));
      expect(bytesToHex(mac)).not.toBe(bytesToHex(enc)); // info 不同 → 两把密钥不同
    });

    it("decryptLongTermKey 能还原 AES-256-GCM(ct||tag) 加密的长期密钥", async () => {
      const enc = randomBytes(32);
      const k = randomBytes(32);
      const { ciphertext, iv } = nodeEncryptKey(enc, k);
      const got = await decryptLongTermKey(new Uint8Array(enc), iv, ciphertext);
      expect(got).toBe(k.toString("hex"));
    });

    it("normalizePairingCode 去连字符/大写并按 Crockford 映射 O→0、I/L→1", () => {
      expect(normalizePairingCode("abcd-2345")).toBe("ABCD2345");
      expect(normalizePairingCode(" o1l-o0 ")).toBe("01100");
    });

    it("constantTimeEqualHex 对相同/不同/不等长返回正确布尔", () => {
      expect(constantTimeEqualHex("deadbeef", "deadbeef")).toBe(true);
      expect(constantTimeEqualHex("deadbeef", "deadbeff")).toBe(false);
      expect(constantTimeEqualHex("dead", "deadbeef")).toBe(false);
    });

    it("hexToBytes 与 bytesToHex 互逆，randomNonceHex 产生 32 字节小写 hex", () => {
      const bytes = new Uint8Array([0, 15, 16, 255]);
      expect(bytesToHex(bytes)).toBe("000f10ff");
      expect([...hexToBytes("000f10ff")]).toEqual([0, 15, 16, 255]);
      const nonce = randomNonceHex();
      expect(nonce).toMatch(/^[0-9a-f]{64}$/);
      expect(utf8Bytes("a").length).toBe(1);
    });
  });

  // ────────────────────────────────────────────────
  describe("会话握手（已配对，双向 HMAC）", () => {
    it("完成 challenge → response → ok 后握手成功，hello 上抛给 SW", async () => {
      const K = randomBytes(32);
      const ws = triggerConnect(sessionParam(K.toString("hex")));
      ws.simulateOpen();

      const nonceD = randomBytes(32).toString("hex");
      ws.simulateMessage({ v: 1, type: "auth.challenge", requestId: "c1", payload: { nonceD } });

      await vi.waitFor(() => expect(ws.sentMessages.length).toBe(1));
      const resp = ws.sent(0);
      expect(resp.type).toBe("auth.response");
      expect(resp.payload.mode).toBe("session");
      // 扩展侧 HMAC 用 sessionExt || nonceD || nonceE，参照实现逐字节复核
      expect(resp.payload.hmac).toBe(nodeHmacHex(new Uint8Array(K), CTX.sessionExt, nonceD, resp.payload.nonceE));

      const okHmac = nodeHmacHex(new Uint8Array(K), CTX.sessionDaemon, resp.payload.nonceE, nonceD);
      ws.simulateMessage({ v: 1, type: "auth.ok", requestId: "c1", payload: { hmac: okHmac } });
      await vi.waitFor(() => expect((externalAccessConnect as any).handshakeComplete).toBe(true));

      ws.simulateMessage({
        v: 1,
        type: "hello",
        requestId: "h1",
        payload: { daemonVersion: "0.1.0", protocolVersion: 1 },
      });
      await vi.waitFor(() => expect(relay.envelope).toHaveBeenCalledTimes(1));
      expect(relay.envelope.mock.calls[0][0].type).toBe("hello");
    });

    it("auth.ok 的 daemon HMAC 不匹配时断开连接、不完成握手", async () => {
      const K = randomBytes(32);
      const ws = triggerConnect(sessionParam(K.toString("hex")));
      ws.simulateOpen();
      ws.simulateMessage({
        v: 1,
        type: "auth.challenge",
        requestId: "c1",
        payload: { nonceD: randomBytes(32).toString("hex") },
      });
      await vi.waitFor(() => expect(ws.sentMessages.length).toBe(1));

      const closeSpy = vi.spyOn(ws, "close");
      ws.simulateMessage({ v: 1, type: "auth.ok", requestId: "c1", payload: { hmac: "00".repeat(32) } });
      await vi.waitFor(() => expect(closeSpy).toHaveBeenCalled());
      expect((externalAccessConnect as any).handshakeComplete).toBe(false);
    });

    it("握手完成前收到业务消息立即断开", async () => {
      const ws = triggerConnect(sessionParam(randomBytes(32).toString("hex")));
      ws.simulateOpen();
      const closeSpy = vi.spyOn(ws, "close");
      ws.simulateMessage({ v: 1, type: "bridge.request", requestId: "r1", payload: {} });
      await vi.waitFor(() => expect(closeSpy).toHaveBeenCalled());
      expect(relay.envelope).not.toHaveBeenCalled();
    });

    it("v 不等于 1 的信封立即断开", async () => {
      const ws = triggerConnect(sessionParam(randomBytes(32).toString("hex")));
      ws.simulateOpen();
      const closeSpy = vi.spyOn(ws, "close");
      ws.simulateMessage({ v: 2, type: "auth.challenge", requestId: "c1", payload: {} });
      await vi.waitFor(() => expect(closeSpy).toHaveBeenCalled());
    });
  });

  // ────────────────────────────────────────────────
  describe("配对握手（首次配对）", () => {
    it("校验 daemon、解密新长期密钥 K 并上抛 paired，随后切换为会话模式", async () => {
      const code = "MNBV-3456";
      const { mac, enc } = nodePairingKeys(code);
      const K = randomBytes(32);

      const ws = triggerConnect({ url: "ws://127.0.0.1:8643", auth: { mode: "pairing", code } });
      ws.simulateOpen();

      const nonceD = randomBytes(32).toString("hex");
      ws.simulateMessage({ v: 1, type: "auth.challenge", requestId: "c1", payload: { nonceD } });
      await vi.waitFor(() => expect(ws.sentMessages.length).toBe(1));
      const resp = ws.sent(0);
      expect(resp.payload.mode).toBe("pairing");
      // 配对模式用 pairExt 上下文 + Kp_mac；且 auth.response 不含配对码本身
      expect(resp.payload.hmac).toBe(nodeHmacHex(new Uint8Array(mac), CTX.pairExt, nonceD, resp.payload.nonceE));
      expect(resp.payload.code).toBeUndefined();

      const okHmac = nodeHmacHex(new Uint8Array(mac), CTX.pairDaemon, resp.payload.nonceE, nonceD);
      const key = nodeEncryptKey(enc, K);
      ws.simulateMessage({ v: 1, type: "auth.ok", requestId: "c1", payload: { hmac: okHmac, key } });

      await vi.waitFor(() => expect(relay.paired).toHaveBeenCalledTimes(1));
      expect(relay.paired.mock.calls[0][0]).toBe(K.toString("hex"));
      expect((externalAccessConnect as any).handshakeComplete).toBe(true);
      // 握手后内部凭据切到会话模式，供后续自动重连
      expect((externalAccessConnect as any).currentParams.auth).toEqual({ mode: "session", key: K.toString("hex") });
    });

    it("配对 auth.ok 缺少 key 时断开、不上抛 paired", async () => {
      const code = "MNBV-3456";
      const { mac } = nodePairingKeys(code);
      const ws = triggerConnect({ url: "ws://127.0.0.1:8643", auth: { mode: "pairing", code } });
      ws.simulateOpen();
      const nonceD = randomBytes(32).toString("hex");
      ws.simulateMessage({ v: 1, type: "auth.challenge", requestId: "c1", payload: { nonceD } });
      await vi.waitFor(() => expect(ws.sentMessages.length).toBe(1));
      const resp = ws.sent(0);
      const okHmac = nodeHmacHex(new Uint8Array(mac), CTX.pairDaemon, resp.payload.nonceE, nonceD);

      const closeSpy = vi.spyOn(ws, "close");
      ws.simulateMessage({ v: 1, type: "auth.ok", requestId: "c1", payload: { hmac: okHmac } });
      await vi.waitFor(() => expect(closeSpy).toHaveBeenCalled());
      expect(relay.paired).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────
  describe("握手后信封路由与心跳", () => {
    async function completeSessionHandshake(): Promise<MockWebSocket> {
      const K = randomBytes(32);
      const ws = triggerConnect(sessionParam(K.toString("hex")));
      ws.simulateOpen();
      const nonceD = randomBytes(32).toString("hex");
      ws.simulateMessage({ v: 1, type: "auth.challenge", requestId: "c1", payload: { nonceD } });
      await vi.waitFor(() => expect(ws.sentMessages.length).toBe(1));
      const resp = ws.sent(0);
      const okHmac = nodeHmacHex(new Uint8Array(K), CTX.sessionDaemon, resp.payload.nonceE, nonceD);
      ws.simulateMessage({ v: 1, type: "auth.ok", requestId: "c1", payload: { hmac: okHmac } });
      await vi.waitFor(() => expect((externalAccessConnect as any).handshakeComplete).toBe(true));
      return ws;
    }

    it("业务信封（bridge.request/bridge.cancel）转发给 SW", async () => {
      const ws = await completeSessionHandshake();
      ws.simulateMessage({ v: 1, type: "bridge.request", requestId: "r1", payload: { action: "scripts.list" } });
      ws.simulateMessage({ v: 1, type: "bridge.cancel", requestId: "r2", payload: {} });
      await vi.waitFor(() => expect(relay.envelope).toHaveBeenCalledTimes(2));
      expect(relay.envelope.mock.calls.map((c) => c[0].type)).toEqual(["bridge.request", "bridge.cancel"]);
    });

    it("收到 ping 回复 pong，不转发给 SW", async () => {
      const ws = await completeSessionHandshake();
      ws.simulateMessage({ v: 1, type: "ping", requestId: "pg1", payload: {} });
      await vi.waitFor(() => expect(ws.sentMessages.length).toBe(2));
      expect(ws.sent(1)).toEqual({ v: 1, type: "pong", requestId: "pg1", payload: {} });
      expect(relay.envelope).not.toHaveBeenCalled();
    });

    it("未知类型忽略且不断开、不转发", async () => {
      const ws = await completeSessionHandshake();
      const closeSpy = vi.spyOn(ws, "close");
      ws.simulateMessage({ v: 1, type: "totally.unknown", requestId: "x1", payload: {} });
      await Promise.resolve();
      expect(closeSpy).not.toHaveBeenCalled();
      expect(relay.envelope).not.toHaveBeenCalled();
    });

    it("SW 下发的出站信封在握手后写入 socket", async () => {
      const ws = await completeSessionHandshake();
      (externalAccessConnect as any).sendEnvelope({
        v: 1,
        type: "bridge.response",
        requestId: "r1",
        payload: { ok: true },
      });
      expect(ws.sent(1).type).toBe("bridge.response");
    });

    it("握手完成前的出站信封被丢弃", () => {
      const ws = triggerConnect(sessionParam(randomBytes(32).toString("hex")));
      ws.simulateOpen();
      (externalAccessConnect as any).sendEnvelope({ v: 1, type: "bridge.response", requestId: "r1", payload: {} });
      expect(ws.sentMessages.length).toBe(0);
    });
  });

  // ────────────────────────────────────────────────
  describe("连接/握手超时与自动重连", () => {
    it("30 秒内未连接成功应关闭 WebSocket", () => {
      vi.useFakeTimers();
      const ws = triggerConnect(sessionParam("aa".repeat(32)));
      const closeSpy = vi.spyOn(ws, "close");
      vi.advanceTimersByTime(30_000);
      expect(closeSpy).toHaveBeenCalled();
    });

    it("打开后 authTimeoutMs 内未完成握手应关闭 WebSocket", () => {
      vi.useFakeTimers();
      const ws = triggerConnect(sessionParam("aa".repeat(32)));
      ws.simulateOpen();
      const closeSpy = vi.spyOn(ws, "close");
      vi.advanceTimersByTime(protocol.limits.authTimeoutMs);
      expect(closeSpy).toHaveBeenCalled();
    });

    it("连接关闭后上抛 disconnected 并按退避自动重连", () => {
      vi.useFakeTimers();
      const ws = triggerConnect(sessionParam("aa".repeat(32)));
      ws.simulateClose();
      expect(relay.disconnected).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1000);
      expect(wsInstances).toHaveLength(2);
    });

    it("disconnect 指令后不再重连", () => {
      vi.useFakeTimers();
      const ws = triggerConnect(sessionParam("aa".repeat(32)));
      (externalAccessConnect as any).currentParams = null;
      (externalAccessConnect as any).dispose();
      ws.simulateClose();
      vi.advanceTimersByTime(30_000);
      expect(wsInstances).toHaveLength(1);
    });

    it("重连延迟指数递增（最大 10 秒）", () => {
      vi.useFakeTimers();
      const ws1 = triggerConnect(sessionParam("aa".repeat(32)));
      ws1.simulateClose();
      vi.advanceTimersByTime(1000);
      expect(wsInstances).toHaveLength(2);
      wsInstances[1].simulateClose();
      vi.advanceTimersByTime(1500);
      expect(wsInstances).toHaveLength(3);
    });

    it("error + close 不触发双重重连", () => {
      vi.useFakeTimers();
      const ws = triggerConnect(sessionParam("aa".repeat(32)));
      ws.simulateError();
      ws.simulateClose();
      vi.advanceTimersByTime(1000);
      expect(wsInstances).toHaveLength(2);
    });
  });

  // ────────────────────────────────────────────────
  describe("Epoch 机制", () => {
    it("新连接使旧连接的消息失效", async () => {
      const ws1 = triggerConnect(sessionParam("aa".repeat(32)));
      ws1.simulateOpen();
      const ws2 = triggerConnect(sessionParam("bb".repeat(32)));
      ws2.simulateOpen();

      // 旧连接收到 challenge 不应产生响应
      ws1.simulateMessage({
        v: 1,
        type: "auth.challenge",
        requestId: "c1",
        payload: { nonceD: randomBytes(32).toString("hex") },
      });
      await Promise.resolve();
      expect(ws1.sentMessages.length).toBe(0);
    });

    it("新连接关闭旧 WebSocket 并清除其事件监听", () => {
      const ws1 = triggerConnect(sessionParam("aa".repeat(32)));
      ws1.simulateOpen();
      const closeSpy = vi.spyOn(ws1, "close");
      triggerConnect(sessionParam("bb".repeat(32)));
      expect(closeSpy).toHaveBeenCalled();
      expect(ws1.onmessage).toBeNull();
    });
  });
});
