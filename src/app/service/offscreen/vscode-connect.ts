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
// 配置与类型定义
// ────────────────────────────────────────────────

const CONFIG = {
  CONNECT_TIMEOUT: 30_000,
  INITIAL_RECONNECT_DELAY: 1000,
  MAX_RECONNECT_DELAY: 10_000,
  HANDSHAKE_MSG: JSON.stringify({ action: "hello" }),
};

export interface VSCodeConnectParam {
  url: string;
  reconnect: boolean;
}

enum VSCodeAction {
  Hello = "hello",
  OnChange = "onchange",
}

interface VSCodeMessage {
  action: VSCodeAction;
  data?: {
    script?: string;
    uri?: string;
    [key: string]: unknown;
  };
}

/**
 * VSCode ↔ ScriptCat 连接管理器
 */
export class VSCodeConnect {
  private readonly logger = LoggerCore.logger().with({
    service: "VSCodeConnect",
  });

  private ws: WebSocket | null = null;
  private connectTimerId: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimerId: ReturnType<typeof setTimeout> | null = null;

  /**
   * * epoch 用于确保非同步回调的时效性
   * * 每次发起新连接时都会递增，旧的 epoch 回调会被忽略
   */
  private epoch = 0;
  private lastParams: VSCodeConnectParam | null = null;
  private reconnectDelay = CONFIG.INITIAL_RECONNECT_DELAY;

  private readonly scriptClient: ScriptClient;
  private readonly messageGroup: Group;

  constructor(messageGroup: Group, messageSender: MessageSend) {
    this.messageGroup = messageGroup;
    this.scriptClient = new ScriptClient(messageSender);
  }

  /**
   * 初始化消息监听
   */
  public init(): void {
    this.messageGroup.on("connect", (param: VSCodeConnectParam) => {
      void this.connect(param);
    });
  }

  /**
   * 建立或替换 WebSocket 连接
   */
  private async connect(params: VSCodeConnectParam): Promise<void> {
    const currentEpoch = (this.epoch = this.epoch === Number.MAX_SAFE_INTEGER ? 1 : this.epoch + 1);
    this.lastParams = { ...params };

    this.cleanup();

    if (!params.url?.trim()) {
      this.logger.warn("Invalid VSCode connection URL provided");
      return;
    }

    try {
      await this.openSocket(params.url, currentEpoch);
      this.logger.info("VSCode WebSocket connected", { url: params.url });
      // 连接成功后重置重连间隔
      this.reconnectDelay = CONFIG.INITIAL_RECONNECT_DELAY;
    } catch (err) {
      if (currentEpoch !== this.epoch) return;

      this.logger.error("VSCode connection attempt failed", Logger.E(err));

      if (params.reconnect) {
        this.queueReconnect();
      }
    }
  }

  // ────────────────────────────────────────────────
  // 核心连接逻辑
  // ────────────────────────────────────────────────

  private openSocket(url: string, currentEpoch: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let isSettled = false;

      const finish = (error?: Error) => {
        if (isSettled) return;
        isSettled = true;
        if (this.connectTimerId) {
          clearTimeout(this.connectTimerId);
          this.connectTimerId = null;
        }

        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      try {
        const socket = new WebSocket(url);
        this.ws = socket;

        // 连接超时处理
        this.connectTimerId = setTimeout(() => {
          if (currentEpoch !== this.epoch) return;
          this.logger.debug("Connection timeout reached");
          this.cleanup();
          finish(new Error("Socket connection timeout"));
        }, CONFIG.CONNECT_TIMEOUT);

        socket.onopen = () => {
          if (currentEpoch !== this.epoch) {
            socket.close();
            return;
          }
          socket.send(CONFIG.HANDSHAKE_MSG);
          finish();
        };

        socket.onmessage = (ev) => {
          if (currentEpoch === this.epoch) {
            this.handleSocketMessage(ev);
          }
        };

        socket.onerror = (_ev) => {
          if (currentEpoch !== this.epoch) return;
          this.logger.debug("WebSocket error", { epoch: currentEpoch });
          finish(new Error("WebSocket error"));
          this.queueReconnect();
        };

        socket.onclose = () => {
          if (currentEpoch !== this.epoch) return;
          this.logger.debug("WebSocket closed", { epoch: currentEpoch });
          finish(new Error("WebSocket closed"));
          this.queueReconnect();
        };
      } catch (err) {
        finish(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  // ────────────────────────────────────────────────
  // 业务逻辑处理
  // ────────────────────────────────────────────────

  private handleSocketMessage(ev: MessageEvent): void {
    if (typeof ev.data !== "string") return;

    try {
      const msg = JSON.parse(ev.data) as VSCodeMessage;

      switch (msg.action) {
        case VSCodeAction.Hello:
          this.logger.debug("Handshake acknowledged by VSCode");
          break;

        case VSCodeAction.OnChange:
          this.processScriptUpdate(msg.data);
          break;

        default:
          this.logger.warn("Received unsupported action", { action: msg.action });
      }
    } catch (err) {
      this.logger.error("Failed to parse or handle message", Logger.E(err));
    }
  }

  private async processScriptUpdate(data: VSCodeMessage["data"]): Promise<void> {
    const { script, uri } = data ?? {};

    if (!script || !uri) {
      this.logger.warn("Received incomplete script update payload");
      return;
    }

    try {
      // 使用 URI 作为 Seed 生成固定 ID
      const stableId = uuidv5(uri, uuidv5.URL);
      await this.scriptClient.installByCode(stableId, script, "vscode");

      this.logger.info("Script synced successfully", {
        uri,
        uuid: stableId,
      });
    } catch (err) {
      this.logger.error("Failed to install script from VSCode", Logger.E(err));
    }
  }

  // ────────────────────────────────────────────────
  // 生命周期管理
  // ────────────────────────────────────────────────

  private queueReconnect(): void {
    if (!this.lastParams?.reconnect || this.reconnectTimerId) return;

    this.logger.debug(`Scheduling reconnect in ${this.reconnectDelay}ms`);

    this.reconnectTimerId = setTimeout(() => {
      this.reconnectTimerId = null;

      // 指数退避策略
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, CONFIG.MAX_RECONNECT_DELAY);

      if (this.lastParams) {
        void this.connect(this.lastParams);
      }
    }, this.reconnectDelay);
  }

  /**
   * 彻底清理资源，确保没有悬挂的 Socket 或 Timer
   */
  private cleanup(): void {
    if (this.connectTimerId) {
      clearTimeout(this.connectTimerId);
      this.connectTimerId = null;
    }
    if (this.reconnectTimerId) {
      clearTimeout(this.reconnectTimerId);
      this.reconnectTimerId = null;
    }
    if (this.ws) {
      // 移除所有回调防止内存泄漏
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;

      if (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
      this.ws = null;
    }
  }
}
