import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { type Group } from "@Packages/message/server";
import type { MessageSend } from "@Packages/message/types";
import { ScriptClient } from "../service_worker/client";
import { v5 as uuidv5 } from "uuid";

/**
 * VSCode ↔ ScriptCat 热重载 / 即时安装桥接核心类
 *
 * ─────────────────────────────────────────────
 * 📌 功能说明
 * ─────────────────────────────────────────────
 * 本类负责与 VS Code 扩展「scriptcat-vscode」建立 WebSocket 连接，实现：
 * 1. 在 VS Code 中储存 `.user.js` 时，即时将脚本内容推送至 ScriptCat
 * 2. 依据脚本 URI 使用 UUID v5 生成稳定脚本 ID，进行安装或更新
 * 3. 提供断线自动重连、30 秒连接超时、VS Code 重启后自动恢复等机制
 *
 *
 * ─────────────────────────────────────────────
 * 🧭 使用流程（使用者视角）
 * ─────────────────────────────────────────────
 *
 * 1️⃣ 安装必要工具
 * - 浏览器安装 ScriptCat：https://scriptcat.org
 * - VS Code 安装 scriptcat-vscode 扩展
 *   - Marketplace 搜寻「ScriptCat」
 *   - 或 GitHub：https://github.com/scriptscat/scriptcat-vscode
 *
 * 2️⃣ 启用 VS Code 自动连接
 * - 打开 ScriptCat
 * - Tools > Development Debugging
 * - 启用并点击：
 *   Auto Connect VSCode Service > Connect
 *
 * 3️⃣ 设定要同步的 `.user.js`
 * - 打开或新增任意 `.user.js` 文件
 * - 可透过 VS Code 指令指定同步模式：
 *
 *   a. 单一脚本模式
 *      - Ctrl + Shift + P
 *      - scriptcat.target
 *      - 指定脚本路径
 *
 *   b. 自动识别模式
 *      - Ctrl + Shift + P
 *      - scriptcat.autoTarget
 *      - 自动同步当前开启的 `.user.js`
 *
 * 4️⃣ 连接开发模式
 * - 在 ScriptCat 设定页或侧边栏点击「连接开发模式」
 * - scriptcat-vscode 会发送 connect 讯息，
 *   并附带 WebSocket 位址（如 ws://localhost:xxxx/...）
 *
 *
 * ─────────────────────────────────────────────
 * 🔌 WebSocket 通讯流程
 * ─────────────────────────────────────────────
 * - 收到 "connect" 事件后建立 WebSocket 连接
 * - 连接成功后发送握手讯息：
 *   { action: "hello" }
 *
 *
 * ─────────────────────────────────────────────
 * 🔄 脚本同步与安装机制
 * ─────────────────────────────────────────────
 * - 每次储存 `.user.js` 时，VS Code 端发送：
 *   {
 *     action: "onchange",
 *     data: {
 *       script: "完整脚本内容",
 *       uri: "file:///..."
 *     }
 *   }
 *
 * - 本类在收到 onchange 后：
 *   - 使用 uuidv5(uri) 生成稳定脚本 ID
 *   - 呼叫 scriptClient.installByCode()
 *     执行脚本安装或更新
 *
 *
 * ─────────────────────────────────────────────
 * 📡 与 scriptcat-vscode 的讯息契约
 * ─────────────────────────────────────────────
 *
 * ▶ VS Code → Service Worker（本类）
 * - "connect": { url: string, reconnect: boolean }
 *   → 触发 connect()
 *
 * ▶ WebSocket → 本类
 * - { action: "hello" }
 *   → 握手讯息（本端主动发送，收到回应则为 ack）
 *
 * - { action: "onchange", data: { script, uri, ... } }
 *   → 安装或更新脚本
 *
 *
 * ─────────────────────────────────────────────
 * 🧠 重要设计决策
 * ─────────────────────────────────────────────
 * - 使用 UUID v5（URI + URL namespace）
 *   → 确保同一档案路径对应固定脚本 ID
 * - 30 秒连接超时与多次重连
 *   → 应对 VS Code 重启或网路短暂中断
 * - ManagedWebSocket 负责事件清理与安全关闭
 *   → 避免记忆体泄漏
 * - reconnect 行为由 VS Code 端控制（通常预设开启）
 *
 *
 * ─────────────────────────────────────────────
 * 🛠 常见问题排查
 * ─────────────────────────────────────────────
 * - 无法连线？确认 ScriptCat 是否启动 WebSocket（常见为 localhost:25389）
 * - 脚本未更新？确认 uri 正确，且 script 为完整用户脚本
 * - 重复安装？检查 stableId 是否稳定（可 console.log）
 * - VS Code 重启未重连？确认扩展设定启用自动连接
 *
 *
 * @see https://github.com/scriptscat/scriptcat-vscode
 * @see https://github.com/scriptscat/scriptcat
 */

/*
  ## Features / 功能特性
    * Initial connect                  初始连接
    * Hello handshake                  Hello 握手
    * 30s connection timeout           30 秒连接超时
    * Auto-install on `onchange`       onchange 时自动安装
    * Stable UUID from URI             基于 URI 的稳定 UUID
    * Reconnect on connect failure     连接失败时自动重连
    * Reconnect on timeout             超时后自动重连
    * Reconnect after successful open  连接成功后仍支援自动重连
    * Handles VSCode restart           支援 VSCode 重启
    * Handles network drop             支援网路断线恢复
*/

/**
 * VSCode ↔ ScriptCat 连接管理器
 *
 * ⚠️ 维护者注意：
 * 本类是一个「强状态 + 并发敏感」的 WebSocket 管理器。
 * 修改 epoch / timeout / cleanup 逻辑前，请完整理解事件顺序。
 */

// ────────────────────────────────────────────────
// 类型定义
// ────────────────────────────────────────────────

const CONFIG = {
  CONNECT_TIMEOUT: 30_000,
  BASE_RECONNECT_DELAY: 1000,
  MAX_RECONNECT_DELAY: 10_000,
  NAMESPACE: uuidv5.URL, // 缓存 UUID Namespace
} as const;

export interface VSCodeConnectParam {
  url: string;
  reconnect: boolean;
}

interface VSCodeMessage {
  action: "hello" | "onchange";
  data?: {
    script?: string;
    uri?: string;
  };
}

/**
 * VSCode ↔ ScriptCat 连接管理器 (Refactored)
 * 核心目标：稳定、易读、无内存泄漏
 */
export class VSCodeConnect {
  private readonly logger = LoggerCore.logger().with({ service: "VSCodeConnect" });
  private readonly scriptClient: ScriptClient;

  // 状态管理
  private ws: WebSocket | null = null;
  private epoch = 0; // 用于废弃旧连接的回调
  private currentParams: VSCodeConnectParam | null = null;

  // 重连策略状态
  private reconnectDelay: number = CONFIG.BASE_RECONNECT_DELAY;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly messageGroup: Group,
    messageSender: MessageSend
  ) {
    this.scriptClient = new ScriptClient(messageSender);
  }

  public init(): void {
    this.messageGroup.on("connect", (params: VSCodeConnectParam) => {
      // this.logger.info("Received connect request", params);
      // 重置重连延迟
      this.reconnectDelay = CONFIG.BASE_RECONNECT_DELAY;
      this.startSession(params);
    });
  }

  /**
   * 启动一个新的连接会话
   * 每次调用都会递增 epoch，自动使旧的连接和定时器失效
   */
  private startSession(params: VSCodeConnectParam): void {
    this.dispose(); // 彻底清理旧资源
    this.currentParams = params;

    // 开启新一轮连接
    this.epoch++;
    this.connect(this.epoch);
  }

  private isReconnecting = false; // 状态锁：防止重复触发重连
  /**
   * 执行实际连接逻辑
   */
  private connect(sessionEpoch: number): void {
    const url = this.currentParams?.url;
    if (!url) return;

    try {
      this.logger.debug(`Attempting connection (Epoch: ${sessionEpoch})`, { url });
      this.isReconnecting = false; // 开始新连接时重置锁
      this.ws = new WebSocket(url);

      // 设置连接超时看门狗
      this.connectTimeoutTimer = setTimeout(() => {
        if (sessionEpoch === this.epoch) {
          this.logger.warn("Connection timeout");
          this.ws?.close();
        }
      }, CONFIG.CONNECT_TIMEOUT);

      // 绑定事件
      this.ws.onopen = () => this.handleOpen(sessionEpoch);
      this.ws.onmessage = (ev) => this.handleMessage(ev, sessionEpoch);
      this.ws.onclose = () => this.handleClose(sessionEpoch);
      this.ws.onerror = (ev) => this.handleError(ev, sessionEpoch);
    } catch (e) {
      this.logger.error("WebSocket creation failed", Logger.E(e));
      this.handleError(e, sessionEpoch);
    }
  }

  // ────────────────────────────────────────────────
  // 事件处理 (Event Handlers)
  // ────────────────────────────────────────────────

  private handleOpen(sessionEpoch: number): void {
    if (sessionEpoch !== this.epoch) return;

    this.logger.info("WebSocket connected");

    // 清除超时检测
    if (this.connectTimeoutTimer) {
      clearTimeout(this.connectTimeoutTimer);
      this.connectTimeoutTimer = null;
    }

    // 重置重连指数退避
    this.reconnectDelay = CONFIG.BASE_RECONNECT_DELAY;

    // 发送握手
    this.send({ action: "hello" });
  }

  private handleMessage(ev: MessageEvent, sessionEpoch: number): void {
    if (sessionEpoch !== this.epoch) return;

    try {
      const msg = JSON.parse(ev.data as string) as VSCodeMessage;

      switch (msg.action) {
        case "hello":
          this.logger.debug("Handshake confirmed");
          break;
        case "onchange":
          void this.handleScriptUpdate(msg.data);
          break;
        default:
          this.logger.warn("Unknown action received", { action: msg.action });
      }
    } catch (e) {
      this.logger.warn("Failed to parse message", Logger.E(e));
    }
  }

  private handleClose(sessionEpoch: number): void {
    if (sessionEpoch !== this.epoch) return;

    // 💡 关闭时不仅置空 ws，也要清理超时计时器
    if (this.connectTimeoutTimer) {
      clearTimeout(this.connectTimeoutTimer);
      this.connectTimeoutTimer = null;
    }

    this.ws = null;
    this.logger.debug("WebSocket connection closed");

    // 无论是由 onerror 还是 onclose 触发，scheduleReconnect 内部的锁 (isReconnecting)
    // 都会确保同一 Epoch 下只开启一个重连计时器，此处作为保底调用。
    this.scheduleReconnect();
  }

  private handleError(ev: Event | Error | unknown, sessionEpoch: number): void {
    if (sessionEpoch !== this.epoch) return;
    this.logger.error("WebSocket error", {
      event: ev instanceof Event ? ev.type : undefined,
      error: ev instanceof Error ? ev.message : String(ev),
    });
    // 发生错误时立即尝试介入重连，无需等待 onclose 事件。
    // 内部锁会拦截后续 handleClose 发起的重复请求。
    this.scheduleReconnect();
  }

  // ────────────────────────────────────────────────
  // 业务逻辑
  // ────────────────────────────────────────────────

  private async handleScriptUpdate(data: VSCodeMessage["data"]): Promise<void> {
    const { script, uri } = data || {};
    if (!script || !uri) {
      this.logger.warn("Invalid script update payload", { uri });
      return;
    }

    try {
      const stableId = uuidv5(uri, CONFIG.NAMESPACE);
      await this.scriptClient.installByCode(stableId, script, "vscode");
      this.logger.info("Script installed/updated", { uuid: stableId, uri });
    } catch (e) {
      this.logger.error("Install failed", Logger.E(e));
    }
  }

  private send(msg: VSCodeMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  // ────────────────────────────────────────────────
  // 辅助与生命周期
  // ────────────────────────────────────────────────

  private scheduleReconnect(): void {
    if (this.isReconnecting) return;
    // 如果不允许重连，或者已经在重连中，或者 Socket 还是开启状态，则跳过
    if (!this.currentParams?.reconnect || this.reconnectTimer) return;
    const sessionEpoch = this.epoch; // 锁定当前的 epoch
    this.isReconnecting = true; // 上锁
    this.logger.debug(`Scheduling reconnect in ${this.reconnectDelay}ms`);

    this.reconnectTimer = setTimeout(() => {
      // 修正 3: 双重检查 epoch，确保在等待重连期间没有开启新的 Session
      if (sessionEpoch !== this.epoch) return;

      this.reconnectTimer = null;
      this.isReconnecting = false;
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, CONFIG.MAX_RECONNECT_DELAY);

      this.connect(sessionEpoch);
    }, this.reconnectDelay);
  }

  /**
   * 销毁当前连接资源
   */
  private dispose(): void {
    this.isReconnecting = false; // 彻底销毁时重置状态

    // 1. 停止所有定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.connectTimeoutTimer) {
      clearTimeout(this.connectTimeoutTimer);
      this.connectTimeoutTimer = null;
    }

    // 2. 关闭 Socket 并移除事件监听 (通过设为 null 配合 GC)
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
