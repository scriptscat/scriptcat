import type { AgentChatRepo } from "@App/app/repo/agent_chat";
import type {
  AgentModelConfig,
  ChatRequest,
  ChatStreamEvent,
  ContentBlock,
  ToolCall,
  ToolDefinition,
} from "@App/app/service/agent/core/types";
import { providerRegistry } from "@App/app/service/agent/core/providers";
import { resolveAttachments } from "@App/app/service/agent/core/attachment_resolver";
import { generateAttachmentId } from "@App/app/service/agent/core/providers/content_utils";

export interface LLMCallResult {
  content: string;
  thinking?: string;
  toolCalls?: ToolCall[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
  };
  contentBlocks?: ContentBlock[];
}

export class LLMClient {
  constructor(private chatRepo: AgentChatRepo) {}

  /**
   * 调用 LLM 并收集完整响应（内部处理流式、重试与图片保存）
   */
  async callLLM(
    model: AgentModelConfig,
    params: { messages: ChatRequest["messages"]; tools?: ToolDefinition[]; cache?: boolean },
    sendEvent: (event: ChatStreamEvent) => void,
    signal: AbortSignal
  ): Promise<LLMCallResult> {
    const chatRequest: ChatRequest = {
      conversationId: "",
      modelId: model.id,
      messages: params.messages,
      tools: params.tools,
      cache: params.cache,
    };

    // 预解析消息中 ContentBlock 引用的 attachmentId → base64
    const attachmentResolver = await resolveAttachments(params.messages, model, (id) =>
      this.chatRepo.getAttachment(id)
    );

    const provider = providerRegistry.get(model.provider);
    if (!provider) {
      throw new Error(`Unsupported LLM provider: ${model.provider}`);
    }
    const { url, init } = await provider.buildRequest({
      model,
      request: chatRequest,
      resolver: attachmentResolver,
    });

    // 带重试的 LLM 调用，最多重试 5 次，间隔递增：10s, 10s, 20s, 20s, 30s
    const RETRY_DELAYS = [10_000, 10_000, 20_000, 20_000, 30_000];
    const MAX_RETRIES = RETRY_DELAYS.length;
    let response!: Response;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        response = await fetch(url, { ...init, signal });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          let errorMessage = `API error: ${response.status}`;
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
          } catch {
            if (errorText) errorMessage += ` - ${errorText.slice(0, 200)}`;
          }
          throw new Error(errorMessage);
        }

        if (!response.body) {
          throw new Error("No response body");
        }
        // 请求成功，跳出重试循环
        break;
      } catch (e: any) {
        // 用户取消时直接抛出，不重试
        if (signal.aborted) throw e;
        // 4xx 客户端错误（除 408/425/429 外）不重试，立即抛出
        const m = (e.message || "").match(/API error:\s*(\d{3})/);
        if (m) {
          const code = Number(m[1]);
          if (code >= 400 && code < 500 && code !== 408 && code !== 425 && code !== 429) {
            throw e;
          }
        }
        // 已用完所有重试次数
        if (attempt >= MAX_RETRIES) throw e;
        // 向 UI 发送重试通知（含延迟时间，用于倒计时显示）
        const delayMs = RETRY_DELAYS[attempt];
        sendEvent({
          type: "retry",
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
          error: e.message || "Unknown error",
          delayMs,
        });
        // 等待后重试，等待期间可被 abort 取消；resolve 时移除监听器避免泄漏
        await new Promise<void>((resolve, reject) => {
          const onAbort = () => {
            clearTimeout(timer);
            reject(new Error("Aborted during retry wait"));
          };
          const timer = setTimeout(() => {
            signal.removeEventListener("abort", onAbort);
            resolve();
          }, delayMs);
          signal.addEventListener("abort", onAbort, { once: true });
        });
      }
    }

    const reader = response.body!.getReader();
    const parseStream = provider.parseStream.bind(provider);

    // 收集响应
    let content = "";
    let thinking = "";
    const toolCalls: ToolCall[] = [];
    let currentToolCall: ToolCall | null = null;
    let usage:
      | { inputTokens: number; outputTokens: number; cacheCreationInputTokens?: number; cacheReadInputTokens?: number }
      | undefined;
    // 收集带 data 的图片 block（模型生成的图片），stream 结束后统一保存到 OPFS
    const pendingImageSaves: Array<{ block: ContentBlock & { type: "image" }; data: string }> = [];

    return new Promise((resolve, reject) => {
      const onEvent = (event: ChatStreamEvent) => {
        // 只转发流式内容事件，done 和 error 由 callLLMWithToolLoop 统一管理
        // 避免在 tool calling 循环中提前发送 done 导致客户端过早 resolve
        // 带 data 的 content_block_complete 暂不转发，等 OPFS 保存后再发
        if (event.type !== "done" && event.type !== "error") {
          if (event.type === "content_block_complete" && event.data) {
            // 暂存，稍后保存到 OPFS 后再转发
            pendingImageSaves.push({ block: event.block as ContentBlock & { type: "image" }, data: event.data });
          } else {
            sendEvent(event);
          }
        }

        switch (event.type) {
          case "content_delta":
            content += event.delta;
            break;
          case "thinking_delta":
            thinking += event.delta;
            break;
          case "tool_call_start":
            // 如果已有一个正在收集的 tool call，先保存它（多个 tool_use 并行返回时）
            if (currentToolCall) {
              toolCalls.push(currentToolCall);
            }
            currentToolCall = { ...event.toolCall, arguments: event.toolCall.arguments || "" };
            break;
          case "tool_call_delta":
            if (currentToolCall) {
              currentToolCall.arguments += event.delta;
            }
            break;
          case "done": {
            // 保存当前的 tool call
            if (currentToolCall) {
              toolCalls.push(currentToolCall);
              currentToolCall = null;
            }
            if (event.usage) {
              usage = event.usage;
            }

            // 保存模型生成的图片到 OPFS，然后转发事件
            const finalize = async () => {
              const savedBlocks: ContentBlock[] = [];
              for (const pending of pendingImageSaves) {
                try {
                  await this.chatRepo.saveAttachment(pending.block.attachmentId, pending.data);
                  savedBlocks.push(pending.block);
                  // 转发不含 data 的 content_block_complete 事件给 UI
                  sendEvent({ type: "content_block_complete", block: pending.block });
                } catch {
                  // 保存失败忽略
                }
              }

              // 提取文本中的 markdown 内联 base64 图片（某些 API 以 ![alt](data:image/...;base64,...) 形式返回图片）
              const imgRegex = /!\[([^\]]*)\]\((data:image\/([^;]+);base64,[A-Za-z0-9+/=\s]+)\)/g;
              let match;
              let cleanedContent = content;
              while ((match = imgRegex.exec(content)) !== null) {
                const [fullMatch, alt, dataUrl, subtype] = match;
                const mimeType = `image/${subtype}`;
                const ext = subtype || "png";
                const blockId = generateAttachmentId(ext);
                try {
                  await this.chatRepo.saveAttachment(blockId, dataUrl);
                  const block: ContentBlock = {
                    type: "image",
                    attachmentId: blockId,
                    mimeType,
                    name: alt || "generated-image",
                  };
                  savedBlocks.push(block);
                  sendEvent({ type: "content_block_complete", block });
                  cleanedContent = cleanedContent.replace(fullMatch, "");
                } catch {
                  // 保存失败保留原始 markdown
                }
              }
              // 清理提取图片后的多余空行
              if (cleanedContent !== content) {
                content = cleanedContent.replace(/\n{3,}/g, "\n\n").trim();
              }

              return savedBlocks.length > 0 ? savedBlocks : undefined;
            };

            finalize()
              .then((contentBlocks) => {
                resolve({
                  content,
                  thinking: thinking || undefined,
                  toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                  usage,
                  contentBlocks,
                });
              })
              .catch(reject);
            break;
          }
          case "error":
            reject(new Error(event.message));
            break;
        }
      };

      parseStream(reader, onEvent, signal).catch(reject);
    });
  }
}
