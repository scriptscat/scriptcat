import { describe, expect, it } from "vitest";
import {
  elideOldToolResults,
  ELIDED_TOOL_RESULT_STUB,
  elideUntilWithinBudget,
  estimateRequestTokens,
} from "./context_elision";
import type { ChatRequest } from "./types";

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

  it("按附件实际字节估算，并可只省略较旧的多模态块", () => {
    const messages: ChatRequest["messages"] = [
      { role: "user", content: [{ type: "image", attachmentId: "old", mimeType: "image/png" }] },
      { role: "assistant", content: "已看到图片" },
      { role: "user", content: "继续" },
    ];
    const sizes = new Map([["old", 6000]]);
    expect(estimateRequestTokens(messages, [], sizes)).toBeGreaterThan(6000);
    expect(elideUntilWithinBudget(messages, 1000, [], 0.9, sizes)).toBe(true);
    expect(messages[0].content).toEqual([{ type: "text", text: expect.stringContaining("attachment elided") }]);
    expect(messages[2].content).toBe("继续");
  });
});
