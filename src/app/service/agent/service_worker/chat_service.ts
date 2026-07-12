import type { IGetSender } from "@Packages/message/server";
import type { MessageConnect } from "@Packages/message/types";
import { uuidv4 } from "@App/pkg/utils/uuid";
import type { ToolCall } from "@App/app/service/agent/core/types";
import { ChatService as BaseChatService } from "./chat_service_base";

export * from "./chat_service_base";

/** 为脚本工具连接增加批次关联，并在后台客户端离线后返回结构化错误。 */
export class ChatService extends BaseChatService {
  async handleConversationChat(params: any, sender: IGetSender) {
    const original = sender.getConnect();
    if (!original) return super.handleConversationChat(params, sender);

    let disconnected = false;
    let activeRequestId: string | undefined;
    const inboundHandlers: Array<(message: any) => void> = [];

    const failBatch = (message: any, reason: string) => {
      const toolCalls: ToolCall[] = message.data || [];
      queueMicrotask(() => {
        const response = {
          action: "toolResults",
          requestId: message.requestId,
          data: toolCalls.map((toolCall) => ({
            id: toolCall.id,
            result: JSON.stringify({ error: reason }),
            error: true,
          })),
        };
        for (const handler of inboundHandlers) handler(response);
      });
    };

    const connection: MessageConnect = {
      onMessage(callback) {
        inboundHandlers.push(callback as (message: any) => void);
        original.onMessage((message: any) => {
          if (message.action === "toolResults") {
            if (!message.requestId || message.requestId !== activeRequestId) return;
            activeRequestId = undefined;
          }
          callback(message);
        });
      },
      sendMessage(message: any) {
        if (message.action !== "executeTools") {
          if (!disconnected) original.sendMessage(message);
          return;
        }

        const correlated = { ...message, requestId: uuidv4() };
        activeRequestId = correlated.requestId;
        if (disconnected) {
          failBatch(correlated, "Script tool client is unavailable");
          return;
        }
        try {
          original.sendMessage(correlated);
        } catch (error) {
          disconnected = true;
          failBatch(
            correlated,
            error instanceof Error && error.message ? error.message : "Script tool client is unavailable"
          );
        }
      },
      disconnect(ignoreAlreadyDisconnected?: boolean) {
        original.disconnect(ignoreAlreadyDisconnected);
      },
      onDisconnect(callback) {
        original.onDisconnect((isSelfDisconnected) => {
          disconnected = true;
          callback(isSelfDisconnected);
        });
      },
    };

    const wrappedSender = new Proxy(sender, {
      get(target, property, receiver) {
        if (property === "getConnect") return () => connection;
        return Reflect.get(target, property, receiver);
      },
    });
    return super.handleConversationChat(params, wrappedSender);
  }
}
