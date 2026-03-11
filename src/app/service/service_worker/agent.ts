import type { Group, IGetSender } from "@Packages/message/server";
import { GetSenderType } from "@Packages/message/server";
import type { SystemConfig, AgentModelConfig } from "@App/pkg/config/config";
import type { ChatRequest, ChatStreamEvent } from "@App/app/service/agent/types";
import { buildOpenAIRequest, parseOpenAIStream } from "@App/app/service/agent/providers/openai";
import { buildAnthropicRequest, parseAnthropicStream } from "@App/app/service/agent/providers/anthropic";

export class AgentService {
  constructor(
    private systemConfig: SystemConfig,
    private group: Group
  ) {}

  init() {
    // 通过 connect 建立流式聊天
    this.group.on("chat", this.handleChat.bind(this));
  }

  private async handleChat(params: ChatRequest, sender: IGetSender) {
    if (!sender.isType(GetSenderType.CONNECT)) {
      throw new Error("AI chat requires connect mode");
    }
    const msgConn = sender.getConnect()!;

    // 获取模型配置
    const agentConfig = await this.systemConfig.getAgentConfig();
    const model = agentConfig.models.find((m: AgentModelConfig) => m.id === params.modelId);
    if (!model) {
      msgConn.sendMessage({
        action: "event",
        data: { type: "error", message: "Model not found" } as ChatStreamEvent,
      });
      msgConn.disconnect();
      return;
    }

    const abortController = new AbortController();
    let isDisconnected = false;

    msgConn.onDisconnect(() => {
      isDisconnected = true;
      abortController.abort();
    });

    const sendEvent = (event: ChatStreamEvent) => {
      if (!isDisconnected) {
        msgConn.sendMessage({ action: "event", data: event });
      }
    };

    try {
      // 根据 provider 构造请求
      const { url, init } =
        model.provider === "anthropic" ? buildAnthropicRequest(model, params) : buildOpenAIRequest(model, params);

      const response = await fetch(url, {
        ...init,
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        let errorMessage = `API error: ${response.status}`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
        } catch {
          if (errorText) errorMessage += ` - ${errorText.slice(0, 200)}`;
        }
        sendEvent({ type: "error", message: errorMessage });
        return;
      }

      if (!response.body) {
        sendEvent({ type: "error", message: "No response body" });
        return;
      }

      const reader = response.body.getReader();

      // 根据 provider 解析流
      const parseStream = model.provider === "anthropic" ? parseAnthropicStream : parseOpenAIStream;

      await parseStream(reader, sendEvent, abortController.signal);
    } catch (e: any) {
      if (abortController.signal.aborted) return;
      sendEvent({ type: "error", message: e.message || "Unknown error" });
    }
  }
}
