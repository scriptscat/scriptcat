import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
import { ExtensionMessage } from "@Packages/message/extension_message";
import { CustomEventMessage } from "@Packages/message/custom_event_message";
import { Server } from "@Packages/message/server";
import { ScriptExecutor } from "./app/service/content/script_executor";
import type { Message } from "@Packages/message/types";
import { getEventFlag } from "@Packages/message/common";
import { ScriptRuntime } from "./app/service/content/script_runtime";
import { ScriptEnvTag } from "@Packages/message/consts";
import { type TExtensionEnv } from "./app/service/extension/extension_env";
import { connectUserScriptChannel } from "./app/service/content/user_script_connection";
import type { TScriptInfo } from "./app/repo/scripts";
import type { GMInfoEnv } from "./app/service/content/types";
import { setPageRpcExtensionOrigin, type ExtensionOrigin } from "./app/service/content/page_rpc";

const messageFlag = process.env.SC_RANDOM_KEY!;

getEventFlag(messageFlag, (eventFlag: string, extensionEnv: TExtensionEnv | undefined) => {
  const scriptEnvTag = ScriptEnvTag.content;

  // USER_SCRIPT 使用浏览器原生扩展通道；DOM 通道只保留同步元素辅助 API，
  // 因为节点引用必须留在当前 content realm。
  const msg: Message = new ExtensionMessage(false);
  const domMsg = new CustomEventMessage(eventFlag, false, scriptEnvTag);
  const domContentMsg = new CustomEventMessage(eventFlag, true, scriptEnvTag);

  // 初始化日志组件
  const logger = new LoggerCore({
    writer: new MessageWriter(msg, "scripting/logger"),
    consoleLevel: process.env.NODE_ENV === "development" ? "debug" : "none", // 只让日志在scripting环境中打印
    labels: { env: "content", href: window.location.href },
  });

  logger.logger().debug("content start");

  const server = new Server("content", msg);
  const domServer = new Server("content", domMsg);
  const scriptExecutor = new ScriptExecutor(msg, domContentMsg, "serviceWorker");
  const runtime = new ScriptRuntime(scriptEnvTag, server, msg, scriptExecutor, extensionEnv);
  runtime.contentInit(domServer, domMsg);
  domServer.on(
    "pageLoad",
    (data: { bootstrapToken?: unknown; envInfo?: GMInfoEnv; extensionOrigin?: ExtensionOrigin }) => {
      if (typeof data?.bootstrapToken !== "string" || data.bootstrapToken.length === 0) return;
      void connectUserScriptChannel(msg, data.bootstrapToken, (_connection, packet) => {
        if (packet.action === "content/pageLoad") {
          const packetData = packet.data as {
            scripts?: TScriptInfo[];
            envInfo?: GMInfoEnv;
            extensionOrigin?: ExtensionOrigin;
          };
          if (
            !packetData ||
            !Array.isArray(packetData.scripts) ||
            packetData.scripts.length === 0 ||
            !packetData.envInfo
          ) {
            return;
          }
          for (let i = 0; i < packetData.scripts.length; i += 1) {
            const script = packetData.scripts[i];
            if (
              !script ||
              typeof script !== "object" ||
              script.executionEnvTag !== scriptEnvTag ||
              typeof script.executionHandle !== "string"
            ) {
              return;
            }
          }
          setPageRpcExtensionOrigin(packetData.extensionOrigin);
          runtime.startScripts(packetData.scripts, packetData.envInfo);
        } else if (packet.action === "content/runtime/valueUpdate") {
          scriptExecutor.valueUpdate(packet.data as any);
        } else if (packet.action === "content/runtime/emitEvent") {
          scriptExecutor.emitEvent(packet.data as any);
        }
      });
    }
  );
  runtime.init();
});
