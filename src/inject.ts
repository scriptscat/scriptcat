import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
import { CustomEventMessage } from "@Packages/message/custom_event_message";
import { PageMessage } from "@Packages/message/page_message";
import { ExtensionMessage, hasNativeRuntimeChannel } from "@Packages/message/extension_message";
import { Server } from "@Packages/message/server";
import { ScriptExecutor } from "./app/service/content/script_executor";
import type { Message } from "@Packages/message/types";
import { getEventFlag } from "@Packages/message/common";
import { ScriptRuntime } from "./app/service/content/script_runtime";
import { ScriptEnvTag } from "@Packages/message/consts";
import { type TExtensionEnv } from "./app/service/extension/extension_env";
import { connectUserScriptChannel, requestUserScriptReconnect } from "./app/service/content/user_script_connection";
import type { MessageConnect, TMessage } from "@Packages/message/types";
import { MainRuntimeSend } from "./app/service/content/main_runtime_send";

const messageFlag = process.env.SC_RANDOM_KEY!;

const NATIVE_BOOTSTRAP_TIMEOUT_MS = 1000;
const NATIVE_RECONNECT_RETRY_MS = 50;
const NATIVE_RECONNECT_RETRY_LIMIT = 20;

getEventFlag(messageFlag, (eventFlag: string, extensionEnv: TExtensionEnv | undefined) => {
  const scriptEnvTag = ScriptEnvTag.inject;

  const pageMsg: Message = new PageMessage(eventFlag, "inject");
  const nativeMsg: Message = new ExtensionMessage(false);
  // 特权 GM RPC 使用浏览器标记的 USER_SCRIPT 来源；页面桥只保留 bootstrap 与 DOM 引用辅助。
  const canUseNativeChannel = hasNativeRuntimeChannel;
  const msg: Message = canUseNativeChannel ? nativeMsg : pageMsg;
  const mainRuntimeSend = new MainRuntimeSend(nativeMsg, pageMsg);

  // 初始化日志组件
  const logger = new LoggerCore({
    writer: new MessageWriter(msg, canUseNativeChannel ? "serviceWorker/logger" : "scripting/logger"),
    consoleLevel: process.env.NODE_ENV === "development" ? "debug" : "none", // 只让日志在scripting环境中打印
    labels: { env: "inject", href: window.location.href },
  });

  logger.logger().debug("inject start");

  const server = new Server("inject", msg);
  const scriptExecutor = new ScriptExecutor(
    mainRuntimeSend,
    new CustomEventMessage(eventFlag, true, ScriptEnvTag.content),
    "serviceWorker"
  );
  const runtime = new ScriptRuntime(scriptEnvTag, server, msg, scriptExecutor, extensionEnv);
  const pageServer = canUseNativeChannel ? new Server("inject", pageMsg) : server;
  let reconnecting = false;
  let openingNative = false;
  let nativeConnection: MessageConnect | undefined;
  let pendingNativeReady:
    | {
        resolve: (connected: boolean) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    | undefined;
  let reconnectToken: string | undefined;
  let initialBootstrapToken: string | undefined;
  let fallbackSelected = false;
  let documentDormant = false;

  const settleNativeReady = (connected: boolean): void => {
    const pending = pendingNativeReady;
    if (!pending) return;
    pendingNativeReady = undefined;
    clearTimeout(pending.timer);
    pending.resolve(connected);
  };

  const handleNativePacket = (_connection: MessageConnect, packet: TMessage) => {
    if (packet.action === "inject/pageLoad") {
      if (!pendingNativeReady || fallbackSelected || documentDormant) {
        try {
          _connection.disconnect(true);
        } catch {
          // The candidate is already stale; there is no live transport to recover.
        }
        return;
      }
      const receipt = runtime.receivePageLoad(packet.data, () => mainRuntimeSend.selectNative());
      if (!receipt.accepted) {
        settleNativeReady(false);
        _connection.disconnect(true);
        return;
      }
      nativeConnection = _connection;
      settleNativeReady(true);
      initialBootstrapToken = undefined;
      if (receipt.reconnectToken) reconnectToken = receipt.reconnectToken;
    } else if (packet.action === "inject/runtime/reconnectReady") {
      if (fallbackSelected || documentDormant || typeof packet.data !== "object" || packet.data === null) return;
      const nextToken = (packet.data as { reconnectToken?: unknown }).reconnectToken;
      if (typeof nextToken !== "string" || nextToken.length === 0) return;
      nativeConnection = _connection;
      settleNativeReady(true);
      reconnectToken = nextToken;
      mainRuntimeSend.selectNative();
    } else if (packet.action === "inject/runtime/valueUpdate") {
      if (!fallbackSelected) runtime.receiveValueUpdate(packet.data);
    } else if (packet.action === "inject/runtime/emitEvent") {
      if (!fallbackSelected) runtime.receiveEmitEvent(packet.data);
    }
  };

  const openNativeChannel = async (bootstrapToken: string): Promise<boolean> => {
    if (documentDormant || fallbackSelected) return false;
    if (openingNative || nativeConnection) return Boolean(nativeConnection);
    openingNative = true;
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        const connection = nativeConnection;
        nativeConnection = undefined;
        settleNativeReady(false);
        try {
          connection?.disconnect(true);
        } catch (error) {
          logger.logger().debug("MAIN USER_SCRIPT channel cleanup failed", { error: String(error) });
        }
      }, NATIVE_BOOTSTRAP_TIMEOUT_MS);
      pendingNativeReady = { resolve, timer };

      void connectUserScriptChannel(
        nativeMsg,
        bootstrapToken,
        handleNativePacket,
        (isSelfDisconnected) => {
          nativeConnection = undefined;
          settleNativeReady(false);
          if (isSelfDisconnected || documentDormant || fallbackSelected || !reconnectToken) return;
          void reconnectNative();
        },
        "MAIN"
      )
        .then((connection) => {
          if (!connection) {
            settleNativeReady(false);
            return;
          }
          if (pendingNativeReady || nativeConnection === connection) {
            nativeConnection = connection;
            return;
          }
          connection.disconnect(true);
        })
        .catch((error) => {
          logger.logger().debug("MAIN USER_SCRIPT channel failed", { error: String(error) });
          settleNativeReady(false);
        })
        .finally(() => {
          openingNative = false;
        });
    });
  };

  const reconnectNative = async (attempt = 0): Promise<void> => {
    if (reconnecting || documentDormant || fallbackSelected || !reconnectToken || nativeConnection) return;
    reconnecting = true;
    try {
      const nextToken = await requestUserScriptReconnect(nativeMsg, reconnectToken);
      const connected = nextToken ? await openNativeChannel(nextToken) : false;
      if (
        !connected &&
        attempt < NATIVE_RECONNECT_RETRY_LIMIT &&
        !documentDormant &&
        !fallbackSelected &&
        reconnectToken
      ) {
        setTimeout(() => void reconnectNative(attempt + 1), NATIVE_RECONNECT_RETRY_MS);
      }
    } catch (error) {
      logger.logger().debug("MAIN USER_SCRIPT reconnect failed", { error: String(error) });
      if (
        attempt < NATIVE_RECONNECT_RETRY_LIMIT &&
        !documentDormant &&
        !fallbackSelected &&
        reconnectToken
      ) {
        setTimeout(() => void reconnectNative(attempt + 1), NATIVE_RECONNECT_RETRY_MS);
      }
    } finally {
      reconnecting = false;
    }
  };

  const openInitialNative = async (attempt = 0): Promise<void> => {
    const token = initialBootstrapToken;
    if (!token || documentDormant || fallbackSelected || reconnectToken) return;
    const connected = await openNativeChannel(token);
    if (
      !connected &&
      attempt < NATIVE_RECONNECT_RETRY_LIMIT &&
      token === initialBootstrapToken &&
      !documentDormant &&
      !fallbackSelected
    ) {
      setTimeout(() => void openInitialNative(attempt + 1), NATIVE_RECONNECT_RETRY_MS);
    }
  };

  const handleFallbackPageLoad = (data: unknown) =>
    runtime.receivePageLoad(data, () => {
      mainRuntimeSend.selectFallback();
      fallbackSelected = true;
      initialBootstrapToken = undefined;
      const connection = nativeConnection;
      nativeConnection = undefined;
      settleNativeReady(false);
      connection?.disconnect(true);
    });

  pageServer.on("bootstrap", (data: { bootstrapToken?: unknown }) => {
    if (typeof data?.bootstrapToken !== "string" || data.bootstrapToken.length === 0) return;
    initialBootstrapToken = data.bootstrapToken;
    if (canUseNativeChannel) void openInitialNative();
  });
  pageServer.on("pageLoad", handleFallbackPageLoad);
  pageServer.on("runtime/valueUpdate", (data) => {
    if (fallbackSelected) runtime.receiveValueUpdate(data);
  });
  pageServer.on("runtime/emitEvent", (data) => {
    if (fallbackSelected) runtime.receiveEmitEvent(data);
  });
  pageServer.on("fallbackBatch", (data) => {
    if (!fallbackSelected) return undefined;
    return runtime.receiveFallbackBatch(data);
  });

  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) return;
    documentDormant = true;
    if (!reconnectToken) {
      const connection = nativeConnection;
      nativeConnection = undefined;
      settleNativeReady(false);
      connection?.disconnect(true);
    }
  });

  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    documentDormant = false;
    if (fallbackSelected || nativeConnection) return;
    if (reconnectToken) void reconnectNative();
    else if (initialBootstrapToken && canUseNativeChannel) void openInitialNative();
  });

  runtime.init({ registerMessageHandlers: false });
  // inject环境，直接判断白名单，注入对外接口
  runtime.externalMessage("scripting", pageMsg);
});
