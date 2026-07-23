import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { type Group } from "@Packages/message/server";
import type { MessageSend } from "@Packages/message/types";
import { ExternalAccessConnectRelayClient } from "../service_worker/client";
import protocol from "../service_worker/external_access/protocol.json";
import type {
  AuthChallengePayload,
  AuthMode,
  AuthOkPayload,
  AuthResponsePayload,
  WSEnvelope,
} from "../service_worker/external_access/types";

/**
 * 外部接入桥接 · offscreen WebSocket client
 *
 * offscreen 拥有到 sctl daemon 的 WS 连接：epoch 守卫的重连 + 指数退避（骨架取自
 * vscode-connect.ts），以及 PROTOCOL §3 的双向 HMAC 握手（WebCrypto）。握手/心跳在本层自持，
 * 业务信封经现有 Group 通道转发给 Service Worker 的 ExternalAccessController。
 *
 * 之所以放 offscreen 而非 SW：写操作审批可能挂起数分钟且期间无流量，MV3 会休眠空闲 SW；
 * offscreen 由这条连接保活，SW 被转发消息唤醒。
 *
 * @see PROTOCOL.md（sctl 仓库）/ protocol.json（本仓库权威常量）
 */

const CONFIG = {
  CONNECT_TIMEOUT: 30_000,
  BASE_RECONNECT_DELAY: 1000,
  MAX_RECONNECT_DELAY: 10_000,
} as const;

const CRYPTO = protocol.crypto;
const NONCE_BYTES = CRYPTO.nonceBytes;
const AUTH_TIMEOUT_MS = protocol.limits.authTimeoutMs;

// 会话模式携带既有长期密钥 K（小写 hex）；配对模式携带 sctl 生成的一次性配对码。
export type ExternalAccessAuth = { mode: "session"; key: string } | { mode: "pairing"; code: string };

export interface ExternalAccessConnectParam {
  url: string;
  auth: ExternalAccessAuth;
}

// ---------------------------------------------------------------------------------------------
// WebCrypto 原语（导出以便 conformance / 互操作向量测试直接钉住线格式）
// ---------------------------------------------------------------------------------------------

// WebCrypto 的 BufferSource 要求 ArrayBuffer 后备（而非 ArrayBufferLike），全部原语统一走此别名。
type Bytes = Uint8Array<ArrayBuffer>;

const textEncoder = new TextEncoder();

export function utf8Bytes(s: string): Bytes {
  const encoded = textEncoder.encode(s);
  const out = new Uint8Array(encoded.length);
  out.set(encoded);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

export function hexToBytes(hex: string): Bytes {
  const out = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function base64ToBytes(b64: string): Bytes {
  const bin = globalThis.atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomNonceHex(): string {
  const bytes = new Uint8Array(NONCE_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

// 恒定时间比较两个等长 hex 字符串。
export function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// 配对码归一化到 Crockford base32 规范形态：去连字符/空白、大写，并按 Crockford 解码规则把
// 易混字符映射回规范字符（O→0、I/L→1），使用户手输的歧义字符与 daemon 生成的规范码派生出同一
// 密钥。daemon 侧同款归一化。
export function normalizePairingCode(code: string): string {
  return code
    .replace(/[^0-9A-Za-z]/g, "")
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

// HMAC-SHA-256(key, utf8(context || firstHex || secondHex)) → 小写 hex。
export async function computeHandshakeHmac(
  keyBytes: Bytes,
  context: string,
  firstHex: string,
  secondHex: string
): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await globalThis.crypto.subtle.sign("HMAC", key, utf8Bytes(context + firstHex + secondHex));
  return bytesToHex(new Uint8Array(sig));
}

// 从配对码 HKDF-SHA-256 派生 MAC 与 AEAD 两把 256-bit 临时密钥。
export async function derivePairingKeys(code: string): Promise<{ mac: Bytes; enc: Bytes }> {
  const ikm = await globalThis.crypto.subtle.importKey("raw", utf8Bytes(normalizePairingCode(code)), "HKDF", false, [
    "deriveBits",
  ]);
  const salt = utf8Bytes(CRYPTO.context.pairKdfSalt);
  const derive = async (info: string): Promise<Bytes> =>
    new Uint8Array(
      await globalThis.crypto.subtle.deriveBits(
        { name: "HKDF", hash: "SHA-256", salt, info: utf8Bytes(info) },
        ikm,
        256
      )
    );
  return { mac: await derive(CRYPTO.context.pairKdfInfoMac), enc: await derive(CRYPTO.context.pairKdfInfoEnc) };
}

// 用 Kp_enc 解密 auth.ok 下发的长期密钥 K（AES-256-GCM，ct||tag 拼接）→ 小写 hex。
export async function decryptLongTermKey(encKeyBytes: Bytes, ivB64: string, ciphertextB64: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey("raw", encKeyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
  const plain = await globalThis.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivB64) },
    key,
    base64ToBytes(ciphertextB64)
  );
  return bytesToHex(new Uint8Array(plain));
}

// 收到 auth.challenge 后，按当前模式计算 auth.response 载荷，并把握手参数带出以便验证 auth.ok。
async function buildAuthResponse(
  auth: ExternalAccessAuth,
  nonceD: string
): Promise<{ payload: AuthResponsePayload; verifyKey: Bytes; nonceE: string; enc?: Bytes }> {
  const nonceE = randomNonceHex();
  const mode: AuthMode = auth.mode;
  if (auth.mode === "session") {
    const keyBytes = hexToBytes(auth.key);
    const hmac = await computeHandshakeHmac(keyBytes, CRYPTO.context.sessionExt, nonceD, nonceE);
    return { payload: { mode, nonceE, hmac }, verifyKey: keyBytes, nonceE };
  }
  const { mac, enc } = await derivePairingKeys(auth.code);
  const hmac = await computeHandshakeHmac(mac, CRYPTO.context.pairExt, nonceD, nonceE);
  return { payload: { mode, nonceE, hmac }, verifyKey: mac, nonceE, enc };
}

export class ExternalAccessConnect {
  private readonly logger = LoggerCore.logger().with({ service: "ExternalAccessConnect" });
  private readonly relay: ExternalAccessConnectRelayClient;

  private ws: WebSocket | null = null;
  private epoch = 0;
  private currentParams: ExternalAccessConnectParam | null = null;
  private handshakeComplete = false;
  // 已发出 auth.response、等待 auth.ok 校验期间保留的握手素材。
  private pendingVerify: { verifyKey: Bytes; nonceD: string; nonceE: string; mode: AuthMode; enc?: Bytes } | null =
    null;

  private reconnectDelay: number = CONFIG.BASE_RECONNECT_DELAY;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private authTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly messageGroup: Group,
    messageSender: MessageSend
  ) {
    this.relay = new ExternalAccessConnectRelayClient(messageSender);
  }

  init(): void {
    this.messageGroup.on("connect", (params: ExternalAccessConnectParam) => {
      this.reconnectDelay = CONFIG.BASE_RECONNECT_DELAY;
      this.startSession(params);
    });
    this.messageGroup.on("disconnect", () => {
      this.currentParams = null;
      this.dispose();
    });
    this.messageGroup.on("send", (envelope: WSEnvelope) => {
      this.sendEnvelope(envelope);
    });
  }

  private startSession(params: ExternalAccessConnectParam): void {
    this.dispose();
    this.currentParams = params;
    this.epoch++;
    this.connect(this.epoch);
  }

  private connect(sessionEpoch: number): void {
    const url = this.currentParams?.url;
    if (!url) return;

    try {
      this.logger.debug(`Attempting connection (Epoch: ${sessionEpoch})`, { url });
      this.ws = new WebSocket(url);
      this.connectTimeoutTimer = setTimeout(() => {
        if (sessionEpoch === this.epoch) {
          this.logger.warn("Connection timeout");
          this.ws?.close();
        }
      }, CONFIG.CONNECT_TIMEOUT);

      this.ws.onopen = () => this.handleOpen(sessionEpoch);
      this.ws.onmessage = (ev) => void this.handleMessage(ev, sessionEpoch);
      this.ws.onclose = () => this.handleClose(sessionEpoch);
      this.ws.onerror = (ev) => this.handleError(ev, sessionEpoch);
    } catch (e) {
      this.logger.error("WebSocket creation failed", Logger.E(e));
      this.handleError(e, sessionEpoch);
    }
  }

  private handleOpen(sessionEpoch: number): void {
    if (sessionEpoch !== this.epoch) return;
    this.logger.info("WebSocket connected, awaiting auth.challenge");
    this.clearTimer("connectTimeoutTimer");
    // 握手必须在 authTimeoutMs 内完成，否则断开重连（PROTOCOL §3）。
    this.authTimeoutTimer = setTimeout(() => {
      if (sessionEpoch === this.epoch && !this.handshakeComplete) {
        this.logger.warn("Auth handshake timeout");
        this.ws?.close();
      }
    }, AUTH_TIMEOUT_MS);
    // daemon 先发 auth.challenge，扩展在此之前不主动发消息。
  }

  private async handleMessage(ev: MessageEvent, sessionEpoch: number): Promise<void> {
    if (sessionEpoch !== this.epoch) return;

    let envelope: WSEnvelope;
    try {
      envelope = JSON.parse(ev.data as string) as WSEnvelope;
    } catch (e) {
      this.logger.warn("Failed to parse message", Logger.E(e));
      return;
    }

    if (envelope.v !== 1) {
      this.logger.warn("Unsupported protocol version, closing", { v: envelope.v });
      this.ws?.close();
      return;
    }

    if (!this.handshakeComplete) {
      await this.handleHandshakeMessage(envelope, sessionEpoch);
      return;
    }

    switch (envelope.type) {
      case "ping":
        this.rawSend({ v: 1, type: "pong", requestId: envelope.requestId, payload: {} });
        break;
      case "pong":
        break;
      case "hello":
      case "bridge.request":
      case "bridge.cancel":
      case "pair.request":
      case "client.sync":
      case "bridge.shutdown":
        void this.relay.envelope(envelope);
        break;
      default:
        // 未知类型：忽略并记日志（前向兼容，PROTOCOL §2）。
        this.logger.warn("Unknown envelope type", { type: envelope.type });
    }
  }

  // 握手期只接受 auth.challenge / auth.ok；其余任何类型立即断开（PROTOCOL §3）。
  private async handleHandshakeMessage(envelope: WSEnvelope, sessionEpoch: number): Promise<void> {
    const auth = this.currentParams?.auth;
    if (!auth) return;

    if (envelope.type === "auth.challenge") {
      const { nonceD } = envelope.payload as AuthChallengePayload;
      const built = await buildAuthResponse(auth, nonceD);
      if (sessionEpoch !== this.epoch) return;
      // 保存验证素材，供随后的 auth.ok 校验使用。
      this.pendingVerify = {
        verifyKey: built.verifyKey,
        nonceD,
        nonceE: built.nonceE,
        mode: auth.mode,
        enc: built.enc,
      };
      this.rawSend({ v: 1, type: "auth.response", requestId: envelope.requestId, payload: built.payload });
      return;
    }

    if (envelope.type === "auth.ok") {
      await this.verifyAuthOk(envelope.payload as AuthOkPayload, sessionEpoch);
      return;
    }

    this.logger.warn("Unexpected message before handshake, closing", { type: envelope.type });
    this.ws?.close();
  }

  private async verifyAuthOk(payload: AuthOkPayload, sessionEpoch: number): Promise<void> {
    const pending = this.pendingVerify;
    if (!pending) {
      this.ws?.close();
      return;
    }
    const context = pending.mode === "session" ? CRYPTO.context.sessionDaemon : CRYPTO.context.pairDaemon;
    const expected = await computeHandshakeHmac(pending.verifyKey, context, pending.nonceE, pending.nonceD);
    if (sessionEpoch !== this.epoch) return;
    if (!constantTimeEqualHex(expected, payload.hmac || "")) {
      this.logger.warn("auth.ok HMAC mismatch, closing");
      this.ws?.close();
      return;
    }

    // 配对模式：解密 daemon 下发的长期密钥 K，持久化交给 SW，并把自身切到会话模式供后续重连。
    if (pending.mode === "pairing") {
      if (!pending.enc || !payload.key) {
        this.logger.warn("pairing auth.ok missing key, closing");
        this.ws?.close();
        return;
      }
      const key = await decryptLongTermKey(pending.enc, payload.key.iv, payload.key.ciphertext);
      if (sessionEpoch !== this.epoch) return;
      if (this.currentParams) this.currentParams = { ...this.currentParams, auth: { mode: "session", key } };
      void this.relay.paired(key);
    }

    this.pendingVerify = null;
    this.handshakeComplete = true;
    this.clearTimer("authTimeoutTimer");
    this.reconnectDelay = CONFIG.BASE_RECONNECT_DELAY;
    this.logger.info("Auth handshake complete");
  }

  // 供 SW 通过 Group 下发的出站信封（bridge.response / pair.decision / client.revoke /
  // bridge.shutdown）；握手完成前直接丢弃（连接尚不可用于业务消息）。
  private sendEnvelope(envelope: WSEnvelope): void {
    if (!this.handshakeComplete) {
      this.logger.warn("Dropped outbound envelope before handshake", { type: envelope.type });
      return;
    }
    this.rawSend(envelope);
  }

  private rawSend(envelope: WSEnvelope): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(envelope));
    }
  }

  private handleClose(sessionEpoch: number): void {
    if (sessionEpoch !== this.epoch) return;
    this.clearTimer("connectTimeoutTimer");
    this.clearTimer("authTimeoutTimer");
    this.ws = null;
    this.handshakeComplete = false;
    this.pendingVerify = null;
    this.logger.debug("WebSocket connection closed");
    void this.relay.disconnected();
    this.scheduleReconnect();
  }

  private handleError(ev: Event | Error | unknown, sessionEpoch: number): void {
    if (sessionEpoch !== this.epoch) return;
    this.logger.error("WebSocket error", {
      event: ev instanceof Event ? ev.type : undefined,
      error: ev instanceof Error ? ev.message : String(ev),
    });
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (!this.currentParams || this.reconnectTimer) return;
    const sessionEpoch = this.epoch;
    this.logger.debug(`Scheduling reconnect in ${this.reconnectDelay}ms`);
    this.reconnectTimer = setTimeout(() => {
      if (sessionEpoch !== this.epoch) return;
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, CONFIG.MAX_RECONNECT_DELAY);
      this.connect(sessionEpoch);
    }, this.reconnectDelay);
  }

  private clearTimer(name: "reconnectTimer" | "connectTimeoutTimer" | "authTimeoutTimer"): void {
    const timer = this[name];
    if (timer) {
      clearTimeout(timer);
      this[name] = null;
    }
  }

  private dispose(): void {
    this.clearTimer("reconnectTimer");
    this.clearTimer("connectTimeoutTimer");
    this.clearTimer("authTimeoutTimer");
    this.handshakeComplete = false;
    this.pendingVerify = null;
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
  }
}
