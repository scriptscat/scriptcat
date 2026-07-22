/**
 * Native Messaging Handler for ScriptCat Service Worker
 *
 * Handles messages from the Native Messaging Host (CLI/MCP Server)
 * and forwards them to ScriptService.
 */

import Logger from "@App/app/logger/logger";
import LoggerCore from "@App/app/logger/core";
import type { ScriptService } from "./script";
import type { Script } from "@App/app/repo/scripts";
import { uuidv4 } from "@App/pkg/utils/uuid";
import { fetchScriptBody, prepareScriptByCode } from "@App/pkg/utils/script";

// ─── Message Types ───────────────────────────────────────

export type NativeMessageType =
  | "list_scripts"
  | "get_script"
  | "install_script"
  | "uninstall_script"
  | "enable_script"
  | "disable_script";

export interface NativeRequest {
  id: string;
  type: NativeMessageType;
  data: Record<string, unknown>;
}

export interface NativeResponse {
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface ScriptSummary {
  uuid: string;
  name: string;
  namespace: string;
  version?: string;
  author?: string;
  type: string;
  status: string;
  enabled: boolean;
  updateUrl?: string;
  description?: string;
}

// ─── Native Messaging Handler ────────────────────────────

export class NativeMessageHandler {
  private logger: Logger;
  private port: chrome.runtime.Port | null = null;

  constructor(private scriptService: ScriptService) {
    this.logger = LoggerCore.logger().with({ module: "native-messaging" });
  }

  private getScriptTypeName(type: number): string {
    switch (type) {
      case 1: return "normal";
      case 2: return "crontab";
      case 3: return "background";
      default: return "unknown";
    }
  }

  private getScriptStatusName(status: number): string {
    switch (status) {
      case 1: return "enabled";
      case 2: return "disabled";
      default: return "unknown";
    }
  }

  private toSummary(script: Script): ScriptSummary {
    return {
      uuid: script.uuid,
      name: script.name,
      namespace: script.namespace || "",
      version: script.metadata.version?.[0],
      author: script.metadata.author?.[0],
      type: this.getScriptTypeName(script.type),
      status: this.getScriptStatusName(script.status),
      enabled: script.status === 1,
      updateUrl: script.checkUpdateUrl,
      description: script.metadata.description?.[0],
    };
  }

  private connect(): void {
    try {
      const port = chrome.runtime.connectNative("com.scriptcat.native_host");
      this.logger.info("Native Messaging connecting...", { name: port.name });
      this.setupPort(port);
    } catch (e) {
      this.logger.error("Native Messaging connect failed", Logger.E(e));
    }
  }

  private setupPort(port: chrome.runtime.Port): void {
    this.port = port;

    port.onMessage.addListener((message: NativeRequest) => {
      this.handleMessage(message).then(
        (response) => { try { port.postMessage(response); } catch (_) {} },
        (error) => {
          try {
            port.postMessage({
              id: message.id,
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            });
          } catch (_) {}
        }
      );
    });

    port.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError;
      this.logger.info("Native Messaging disconnected", { error: err?.message });
      this.port = null;
    });
  }

  start(): void {
    this.connect();
    this.logger.info("Native Messaging handler started");
  }

  private async handleMessage(request: NativeRequest): Promise<NativeResponse> {
    const { id, type, data } = request;

    try {
      let result: unknown;

      switch (type) {
        case "list_scripts": {
          const scripts = await this.scriptService.getAllScripts();
          result = scripts.map((s) => this.toSummary(s));
          break;
        }

        case "get_script": {
          result = await this.scriptService.getScriptAndCode(data.uuid as string);
          break;
        }

        case "install_script": {
          const { url, code } = data as { url?: string; code?: string };
          if (!url && !code) throw new Error("Either 'url' or 'code' is required");

          if (url) {
            const installed = await this.scriptService.installByUrl(url, "user");
            result = { uuid: installed.uuid, name: installed.name, update: false };
          } else {
            const uuid = (data.existing_uuid as string) || uuidv4();
            const installed = await this.scriptService.installByCode({ uuid, code: code!, upsertBy: "user" });
            result = { uuid: installed.uuid, name: installed.name, update: false };
          }
          break;
        }

        case "uninstall_script": {
          const uuid = data.uuid as string;
          if (!uuid) throw new Error("'uuid' is required");
          await this.scriptService.deleteScript(uuid);
          result = { uuid, removed: true };
          break;
        }

        case "enable_script":
        case "disable_script": {
          const uuid = data.uuid as string;
          if (!uuid) throw new Error("'uuid' is required");
          const enable = type === "enable_script";
          await this.scriptService.enableScript({ uuid, enable });
          result = { uuid, enabled: enable };
          break;
        }

        default:
          throw new Error(`Unknown message type: ${type}`);
      }

      return { id, ok: true, data: result };
    } catch (error) {
      this.logger.error("Native message failed", { id, type }, Logger.E(error));
      return {
        id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}