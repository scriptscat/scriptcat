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
import { prepareAttachmentSnapshot, type AttachmentSnapshot } from "@App/app/service/agent/core/attachment_resolver";
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
  /** Non-fatal issue surfaced alongside an otherwise-successful result, e.g. a generated image that
   * failed to persist. The round still resolves so accumulated usage/text aren't discarded, but callers
   * should show this to the user and persist it onto the assistant message. */
  warning?: string;
}

export class LLMClient {
  constructor(private chatRepo: AgentChatRepo) {}

  /**
   * 调用 LLM 并收集完整响应（内部处理流式、重试与图片保存）
   */
  async callLLM(
    model: AgentModelConfig,
    params: {
      messages: ChatRequest["messages"];
      tools?: ToolDefinition[];
      cache?: boolean;
      attachmentSnapshot?: AttachmentSnapshot;
    },
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
    const attachmentSnapshot =
      params.attachmentSnapshot ||
      (await prepareAttachmentSnapshot(params.messages, model, (id) => this.chatRepo.getAttachment(id), signal));

    const provider = providerRegistry.get(model.provider);
    if (!provider) {
      throw new Error(`Unsupported LLM provider: ${model.provider}`);
    }
    const { url, init } = await provider.buildRequest({
      model,
      request: chatRequest,
      resolver: attachmentSnapshot.resolver,
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
    let usage:
      | { inputTokens: number; outputTokens: number; cacheCreationInputTokens?: number; cacheReadInputTokens?: number }
      | undefined;
    // 收集带 data 的图片 block（模型生成的图片），stream 结束后统一保存到 OPFS
    const pendingImageSaves: Array<{ block: ContentBlock & { type: "image" }; data: string }> = [];

    return new Promise((resolve, reject) => {
      // 最后一道保险：即使 provider parser 出现未预见的静默完成路径，也不能让这个 Promise 永远挂起
      let settled = false;
      const settleOnce = (fn: () => void) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbortSafeguard);
        fn();
      };
      // parseStream 自身在 abort 时会 reject，并可能携带这一轮已知的部分 usage（见 openai.ts/
      // anthropic.ts）。这里的 signal 监听只是最后一道保险，不能抢在 parseStream 的 reject 之前
      // 立即 settle——那样会用一个不带 usage 的裸 Error 抢占更有信息量的那个 reject。
      // 延迟到下一个宏任务，给 parseStream 的 reject 一个先落定的机会，本身仍然是安全网，
      // 不依赖它必定生效。
      const onAbortSafeguard = () => {
        setTimeout(() => settleOnce(() => reject(Object.assign(new Error("Aborted"), { usage }))), 0);
      };
      signal.addEventListener("abort", onAbortSafeguard, { once: true });
      const resolveOnce: typeof resolve = (value) => settleOnce(() => resolve(value));
      const rejectOnce: typeof reject = (reason) => settleOnce(() => reject(reason));

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
            // 并发 tool_call 时 parser 会交错发 delta，这里立即 push 到数组，
            // 由 tool_call_delta 通过 id/index 定位目标 tool，避免串扰。
            toolCalls.push({ ...event.toolCall, arguments: event.toolCall.arguments || "", status: "running" });
            break;
          case "tool_call_delta": {
            if (!toolCalls.length) break;
            let target: ToolCall | undefined = undefined;
            // 1a. 按 id 匹配
            if (event.id) {
              target = toolCalls.find((t) => t.id === event.id);
            }
            // 1b. 按 index 匹配（OpenAI 后续 chunk 无 id 只有 index）
            if (!target && event.index !== undefined) {
              target = toolCalls[event.index];
            }
            // 2. fallback：最新一个状态为 running 的 tool call
            if (!target) {
              for (let i = toolCalls.length - 1; i >= 0; i--) {
                if (toolCalls[i].status === "running") {
                  target = toolCalls[i];
                  break;
                }
              }
            }
            if (target) target.arguments += event.delta;
            break;
          }
          case "done": {
            if (event.usage) {
              usage = event.usage;
            }

            // 保存模型生成的图片到 OPFS，然后转发事件。
            // abort 安全：settled 一旦为 true（外层 Promise 已因 abort 落定），后续保存产生的
            // 附件不会再被任何持久化的 assistant 消息引用，是孤儿文件；已发出的 content_block_complete
            // 也会晚于终态事件到达客户端。因此每一步都先检查 settled，中途发现已 settle 就
            // 停止继续保存/发送，并清理这一轮已经落盘但用不上的附件。
            const finalize = async () => {
              const savedBlocks: ContentBlock[] = [];
              // 本轮所有成功落盘的附件 id（不止是取消时正在保存的那一个）：一旦 settled，
              // finalize() 的返回值不会再被使用（resolveOnce/rejectOnce 已是 no-op），
              // 这一轮已经保存的所有附件都变成孤儿文件，必须全部清理，不能只删除取消时
              // 正在保存的那一个而漏掉更早已经保存成功的
              const allSavedIds: string[] = [];
              // 保存失败的图片没有 markdown 原文可回退：之前静默丢弃，用户会拿到一个成功、
              // 计费的回复但缺图（甚至纯图回复时 content 为空）。记录数量，随结果一起报告
              // 给调用方持久化/展示，而不是假装什么都没发生
              let failedImageSaves = 0;
              for (const pending of pendingImageSaves) {
                if (settled) break;
                try {
                  await this.chatRepo.saveAttachment(pending.block.attachmentId, pending.data);
                  allSavedIds.push(pending.block.attachmentId);
                  if (settled) break;
                  savedBlocks.push(pending.block);
                  // 转发不含 data 的 content_block_complete 事件给 UI
                  sendEvent({ type: "content_block_complete", block: pending.block });
                } catch {
                  failedImageSaves++;
                }
              }

              // 提取文本中的 markdown 内联 base64 图片（某些 API 以 ![alt](data:image/...;base64,...) 形式返回图片）
              const imgRegex = /!\[([^\]]*)\]\((data:image\/([^;]+);base64,[A-Za-z0-9+/=\s]+)\)/g;
              let match;
              let cleanedContent = content;
              while (!settled && (match = imgRegex.exec(content)) !== null) {
                const [fullMatch, alt, dataUrl, subtype] = match;
                const mimeType = `image/${subtype}`;
                const ext = subtype || "png";
                const blockId = generateAttachmentId(ext);
                try {
                  await this.chatRepo.saveAttachment(blockId, dataUrl);
                  allSavedIds.push(blockId);
                  if (settled) break;
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

              if (settled && allSavedIds.length > 0) {
                await Promise.all(allSavedIds.map((id) => this.chatRepo.deleteAttachment(id).catch(() => {})));
              }

              return {
                contentBlocks: savedBlocks.length > 0 ? savedBlocks : undefined,
                warning:
                  failedImageSaves > 0
                    ? `${failedImageSaves} generated image(s) failed to save and were lost.`
                    : undefined,
              };
            };

            finalize()
              .then(({ contentBlocks, warning }) => {
                resolveOnce({
                  content,
                  thinking: thinking || undefined,
                  toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                  usage,
                  contentBlocks,
                  warning,
                });
              })
              .catch(rejectOnce);
            break;
          }
          case "error":
            // 保留 usage/errorCode/durationMs 等字段，不能转成裸 Error 丢掉这些信息
            rejectOnce(
              Object.assign(new Error(event.message), {
                errorCode: event.errorCode,
                usage: event.usage,
                durationMs: event.durationMs,
              })
            );
            break;
        }
      };

      parseStream(reader, onEvent, signal).catch(rejectOnce);
    });
  }
}
