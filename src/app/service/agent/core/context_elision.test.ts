import { describe, expect, it } from "vitest";
import {
  elideOldToolResults,
  elideOldAttachments,
  ELIDED_TOOL_RESULT_STUB,
  elideUntilWithinBudget,
  estimateRequestTokens,
} from "./context_elision";
import type { AgentModelConfig, ChatRequest, ToolCall } from "./types";

const VISION_MODEL: AgentModelConfig = {
  id: "m-vision",
  name: "Vision",
  provider: "openai",
  apiBaseUrl: "",
  apiKey: "",
  model: "gpt-4o",
};

const NON_VISION_MODEL: AgentModelConfig = {
  id: "m-text",
  name: "Text",
  provider: "openai",
  apiBaseUrl: "",
  apiKey: "",
  model: "gpt-4",
};

// 构造一轮 assistant(带 toolCalls) + N 条 tool 结果
function round(index: number, toolCount = 1): ChatRequest["messages"] {
  const assistantMsg: ChatRequest["messages"][number] = {
    role: "assistant",
    content: `assistant-${index}`,
    toolCalls: Array.from({ length: toolCount }, (_, i) => ({
      id: `t${index}-${i}`,
      name: "execute_script",
      arguments: "{}",
    })),
  };
  const toolMsgs: ChatRequest["messages"] = Array.from({ length: toolCount }, (_, i) => ({
    role: "tool" as const,
    content: `tool-result-${index}-${i}`,
    toolCallId: `t${index}-${i}`,
  }));
  return [assistantMsg, ...toolMsgs];
}

describe("elideOldToolResults", () => {
  it("轮次数不超过保留窗口时不应裁剪任何 tool 结果", () => {
    const messages: ChatRequest["messages"] = [{ role: "user", content: "开始" }, ...round(1), ...round(2)];
    elideOldToolResults(messages, 5);
    expect(messages.every((m) => m.role !== "tool" || m.content !== ELIDED_TOOL_RESULT_STUB)).toBe(true);
  });

  it("超过保留窗口的旧 tool 结果应被替换为占位文本，最近 K 轮保持不变", () => {
    const messages: ChatRequest["messages"] = [
      { role: "user", content: "开始" },
      ...round(1),
      ...round(2),
      ...round(3),
    ];
    elideOldToolResults(messages, 2);

    // 第 1 轮（最旧，超出保留窗口）应被裁剪
    const round1Tool = messages.find((m) => m.toolCallId === "t1-0");
    expect(round1Tool?.content).toBe(ELIDED_TOOL_RESULT_STUB);

    // 第 2、3 轮（最近 2 轮）应保持原文
    const round2Tool = messages.find((m) => m.toolCallId === "t2-0");
    const round3Tool = messages.find((m) => m.toolCallId === "t3-0");
    expect(round2Tool?.content).toBe("tool-result-2-0");
    expect(round3Tool?.content).toBe("tool-result-3-0");
  });

  it("assistant 消息文本与 toolCalls 不应被裁剪，只处理 tool 角色消息", () => {
    const messages: ChatRequest["messages"] = [
      { role: "user", content: "开始" },
      ...round(1),
      ...round(2),
      ...round(3),
    ];
    elideOldToolResults(messages, 2);

    const round1Assistant = messages.find((m) => m.role === "assistant" && m.content === "assistant-1");
    expect(round1Assistant).toBeDefined();
    expect(round1Assistant?.toolCalls).toHaveLength(1);
  });

  it("已裁剪过的 tool 结果再次裁剪应保持幂等", () => {
    const messages: ChatRequest["messages"] = [
      { role: "user", content: "开始" },
      ...round(1),
      ...round(2),
      ...round(3),
    ];
    elideOldToolResults(messages, 2);
    elideOldToolResults(messages, 2);

    const round1Tool = messages.find((m) => m.toolCallId === "t1-0");
    expect(round1Tool?.content).toBe(ELIDED_TOOL_RESULT_STUB);
  });

  it("单轮内多个 tool 结果应一并裁剪", () => {
    const messages: ChatRequest["messages"] = [
      { role: "user", content: "开始" },
      ...round(1, 3),
      ...round(2),
      ...round(3),
    ];
    elideOldToolResults(messages, 2);

    expect(messages.find((m) => m.toolCallId === "t1-0")?.content).toBe(ELIDED_TOOL_RESULT_STUB);
    expect(messages.find((m) => m.toolCallId === "t1-1")?.content).toBe(ELIDED_TOOL_RESULT_STUB);
    expect(messages.find((m) => m.toolCallId === "t1-2")?.content).toBe(ELIDED_TOOL_RESULT_STUB);
  });
});

describe("上下文预算估算与裁剪", () => {
  it("按 UTF-8 字节和工具定义保守估算请求 token", () => {
    const messages: ChatRequest["messages"] = [{ role: "user", content: "你好世界" }];
    const small = estimateRequestTokens(messages, []);
    const large = estimateRequestTokens(messages, [{ name: "工具", description: "x".repeat(1000) }]);

    expect(large).toBeGreaterThan(small);
  });

  it("完整历史超过预算时裁剪工具结果，预算内的小历史保持原文", () => {
    const smallHistory: ChatRequest["messages"] = [{ role: "user", content: "你好" }, ...round(1), ...round(2)];
    elideUntilWithinBudget(smallHistory, 1000, [], 0.6);
    expect(smallHistory.find((message) => message.role === "tool")?.content).toBe("tool-result-1-0");

    const largeHistory: ChatRequest["messages"] = [];
    for (let i = 0; i < 5; i++) {
      largeHistory.push(...round(i));
      const tool = largeHistory[largeHistory.length - 1];
      if (tool.role === "tool") tool.content = "结果".repeat(5000);
    }
    elideUntilWithinBudget(largeHistory, 1000, [], 0.6);
    expect(
      largeHistory
        .filter((message) => message.role === "tool")
        .every((message) => message.content === ELIDED_TOOL_RESULT_STUB)
    ).toBe(true);
  });

  it("vision 模型下按图片附件实际字节估算，并可只省略较旧的多模态块", () => {
    const messages: ChatRequest["messages"] = [
      { role: "user", content: [{ type: "image", attachmentId: "old", mimeType: "image/png" }] },
      { role: "assistant", content: "已看到图片" },
      { role: "user", content: "继续" },
    ];
    // 用较大的真实照片量级（600KB）而不是 6000 字节：折算后（/40）约 2 万 token，
    // 明显超出 1000 的预算才能触发裁剪；6000 字节这种量级折算后不到 200 token，不足以撑爆预算。
    const sizes = new Map([["old", 600_000]]);
    // 图片按 IMAGE_CONSERVATIVE_BYTES_PER_TOKEN（40）折算为 token（见 finding 8：不能再把
    // base64 字节数 1:1 当 token 数，否则普通照片会被判定为超出上下文）。
    // 验证 base64 展开确实被计入——若只是把原始字节数朴素除以换算系数（600000/40=15000），
    // 结果不会低于它。
    expect(estimateRequestTokens(messages, [], sizes, VISION_MODEL)).toBeGreaterThan(15_000);
    expect(elideUntilWithinBudget(messages, 1000, [], 0.9, sizes, VISION_MODEL)).toBe(true);
    expect(messages[0].content).toEqual([{ type: "text", text: expect.stringContaining("attachment elided") }]);
    expect((messages[0].content as any)[0].text).toContain("uploads/old");
    expect(messages[2].content).toBe("继续");
  });

  it("vision 模型下缺失图片大小时应使用文本降级估算而不是 Infinity", () => {
    const messages: ChatRequest["messages"] = [
      { role: "user", content: [{ type: "image", attachmentId: "missing", mimeType: "image/png" }] },
    ];

    const estimate = estimateRequestTokens(messages, [], undefined, VISION_MODEL);

    expect(Number.isFinite(estimate)).toBe(true);
    expect(estimate).toBeGreaterThan(0);
  });

  it("非 vision 模型下不解析图片，不应因缺失大小把预算估算撑爆", () => {
    const messages: ChatRequest["messages"] = [
      { role: "user", content: [{ type: "image", attachmentId: "old", mimeType: "image/png" }] },
    ];
    // 没有提供 size（模拟无法读取该附件），非 vision 模型下图片从不内联，不应导致 Infinity
    expect(estimateRequestTokens(messages, [], undefined, NON_VISION_MODEL)).toBeLessThan(Number.POSITIVE_INFINITY);
  });

  it("file 块从不内联为二进制，缺失大小也不应导致估算为 Infinity", () => {
    const messages: ChatRequest["messages"] = [
      {
        role: "user",
        content: [{ type: "file", attachmentId: "missing-file", mimeType: "application/pdf", name: "a.pdf" }],
      },
    ];
    expect(estimateRequestTokens(messages, [], undefined, VISION_MODEL)).toBeLessThan(Number.POSITIVE_INFINITY);
  });

  it("audio 块从不内联为二进制，即使是 vision 模型也不应计入大文件字节", () => {
    const bigSize = 50_000_000;
    const messages: ChatRequest["messages"] = [
      { role: "user", content: [{ type: "audio", attachmentId: "audio1", mimeType: "audio/mpeg" }] },
    ];
    const sizes = new Map([["audio1", bigSize]]);
    const estimate = estimateRequestTokens(messages, [], sizes, VISION_MODEL);
    expect(estimate).toBeLessThan(bigSize);
  });

  it("普通 100KB 照片不应被判定为超出未配置 contextWindow 模型（128K）的输入预算（finding 8）", () => {
    const messages: ChatRequest["messages"] = [
      { role: "user", content: "帮我看看这张截图" },
      { role: "user", content: [{ type: "image", attachmentId: "screenshot", mimeType: "image/png" }] },
    ];
    const sizes = new Map([["screenshot", 100_000]]);
    // VISION_MODEL 未显式配置 contextWindow，按 gpt-4o 前缀推断为 128_000
    const estimate = estimateRequestTokens(messages, [], sizes, VISION_MODEL);
    // 128_000 * 0.9 的预检阈值 ≈ 115_200；一张普通照片折算后的 token 数应远低于这个预算，
    // 而不是像按 1 字节 = 1 token 估算那样膨胀到十几万 token 直接把预算撑爆
    expect(estimate).toBeLessThan(115_200 * 0.5);
  });
});

describe("estimateRequestTokens 的按消息缓存不应产生陈旧结果", () => {
  it("elideOldToolResults 原地改写 content 后，同一批 message 对象的估算值应立即反映裁剪后的内容", () => {
    const messages: ChatRequest["messages"] = [
      { role: "user", content: "你好" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "c1", name: "tool", arguments: "{}", status: "completed" }],
      },
      { role: "tool", content: "x".repeat(5000), toolCallId: "c1" },
    ];

    const before = estimateRequestTokens(messages);
    // keepLastAssistantTurns=0 会把所有 tool 结果裁剪为占位文本
    elideOldToolResults(messages, 0);
    const after = estimateRequestTokens(messages);

    expect(after).toBeLessThan(before);
    expect(messages[2].content).toBe(ELIDED_TOOL_RESULT_STUB);
  });

  it("elideOldAttachments 原地改写 content 后，估算值应立即反映占位后的内容", () => {
    const messages: ChatRequest["messages"] = [
      { role: "user", content: [{ type: "image", attachmentId: "img1", mimeType: "image/png" }] },
      { role: "user", content: "占位" },
      { role: "user", content: "占位" },
    ];
    const sizes = new Map([["img1", 6_000_000]]);

    const before = estimateRequestTokens(messages, [], sizes, VISION_MODEL);
    elideOldAttachments(messages, 2);
    const after = estimateRequestTokens(messages, [], sizes, VISION_MODEL);

    expect(after).toBeLessThan(before);
    expect(messages[0].content).toEqual([{ type: "text", text: expect.stringContaining("attachment elided") }]);
  });

  it("assistant 消息的 toolCalls.status 在工具执行后原地变化时，估算值应反映最新状态而非缓存旧值", () => {
    const toolCall: ToolCall = { id: "c1", name: "tool", arguments: "{}", status: "running" };
    const messages: ChatRequest["messages"] = [{ role: "assistant", content: "", toolCalls: [toolCall] }];

    const runningEstimate = estimateRequestTokens(messages);
    // 工具执行完成后原地回写 status（tool_loop_orchestrator_base.ts 的 applyToolUpdates 同款操作）
    toolCall.status = "completed";
    toolCall.result = "a longer completed result string that changes the byte size";
    const completedEstimate = estimateRequestTokens(messages);

    expect(completedEstimate).toBeGreaterThan(runningEstimate);
  });

  it("反复调用应返回稳定一致的结果（缓存命中不改变估算值）", () => {
    const messages: ChatRequest["messages"] = [
      { role: "user", content: "稳定内容".repeat(100) },
      { role: "assistant", content: "回复内容".repeat(100) },
    ];

    const first = estimateRequestTokens(messages);
    const second = estimateRequestTokens(messages);
    const third = estimateRequestTokens(messages);

    expect(second).toBe(first);
    expect(third).toBe(first);
  });
});
