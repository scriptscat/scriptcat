import { describe, it, expect } from "vitest";
import type { SubAgentState } from "./types";
import type { ChatMessage, ToolCall } from "@App/app/service/agent/core/types";
import { getSubAgentForToolCall, mergeToolResults } from "./chat_utils";

// 辅助：创建子代理状态
function makeSA(overrides: Partial<SubAgentState> & { agentId: string }): SubAgentState {
  return {
    description: "test sub-agent",
    completedMessages: [],
    currentContent: "",
    currentThinking: "",
    currentToolCalls: [],
    isRunning: true,
    ...overrides,
  };
}

describe("getSubAgentForToolCall", () => {
  describe("非 agent 工具调用", () => {
    it("name 不是 agent 时返回 undefined", () => {
      const result = getSubAgentForToolCall({ name: "web_search" });
      expect(result).toBeUndefined();
    });
  });

  describe("路径 1a：通过 tc.result 中的 agentId 匹配", () => {
    it("result 包含 [agentId: xxx] 且 subAgents 有对应项", () => {
      const sa = makeSA({ agentId: "agent-1" });
      const subAgents = new Map([["agent-1", sa]]);
      const result = getSubAgentForToolCall(
        { name: "agent", result: "[agentId: agent-1]\n\nTask completed." },
        subAgents
      );
      expect(result).toBe(sa);
    });

    it("result 中的 agentId 在 subAgents 中不存在时继续后续匹配", () => {
      const subAgents = new Map<string, SubAgentState>();
      const result = getSubAgentForToolCall({ name: "agent", result: "[agentId: unknown-id]\n\nDone." }, subAgents);
      expect(result).toBeUndefined();
    });
  });

  describe("路径 1b：通过 arguments.to 匹配（resume 场景）", () => {
    it("arguments 有 to 字段且匹配 subAgents", () => {
      const sa = makeSA({ agentId: "agent-2" });
      const subAgents = new Map([["agent-2", sa]]);
      const result = getSubAgentForToolCall(
        { name: "agent", arguments: JSON.stringify({ prompt: "continue", to: "agent-2" }) },
        subAgents
      );
      expect(result).toBe(sa);
    });
  });

  describe("路径 1c：无 result 时匹配运行中或已完成的子代理", () => {
    it("子代理正在运行时匹配", () => {
      const sa = makeSA({ agentId: "agent-3", isRunning: true });
      const subAgents = new Map([["agent-3", sa]]);
      const result = getSubAgentForToolCall({ name: "agent" }, subAgents);
      expect(result).toBe(sa);
    });

    it("【关键场景】子代理已完成但 result 尚未到达时，回退匹配已完成的子代理", () => {
      const sa = makeSA({ agentId: "agent-3", isRunning: false });
      const subAgents = new Map([["agent-3", sa]]);
      const result = getSubAgentForToolCall({ name: "agent" }, subAgents);
      expect(result).toBe(sa);
    });

    it("多个子代理时优先匹配运行中的", () => {
      const completed = makeSA({ agentId: "agent-done", isRunning: false });
      const running = makeSA({ agentId: "agent-running", isRunning: true });
      const subAgents = new Map([
        ["agent-done", completed],
        ["agent-running", running],
      ]);
      const result = getSubAgentForToolCall({ name: "agent" }, subAgents);
      expect(result).toBe(running);
    });

    it("tc.result 已设置时不走 1c 路径", () => {
      const sa = makeSA({ agentId: "agent-x", isRunning: true });
      const subAgents = new Map([["agent-x", sa]]);
      const result = getSubAgentForToolCall({ name: "agent", result: "[agentId: other]\n\nDone." }, subAgents);
      expect(result).toBeUndefined();
    });
  });

  describe("路径 0：显式 toolCallId 匹配（并发 agent 调用）", () => {
    it("两个并行 agent 调用各自匹配到自己的子代理，不会都指向同一个", () => {
      const saA = makeSA({ agentId: "agent-a", toolCallId: "tc-a", isRunning: true });
      const saB = makeSA({ agentId: "agent-b", toolCallId: "tc-b", isRunning: true });
      const subAgents = new Map([
        ["agent-a", saA],
        ["agent-b", saB],
      ]);

      // 两个工具调用均无 result（仍在流式中），仅凭各自的 toolCallId 区分
      const tcA = { id: "tc-a", name: "agent" };
      const tcB = { id: "tc-b", name: "agent" };

      expect(getSubAgentForToolCall(tcA, subAgents)).toBe(saA);
      expect(getSubAgentForToolCall(tcB, subAgents)).toBe(saB);
    });

    it("其中一个子代理率先启动运行时，另一个仍未产生事件的调用不会被误配给它", () => {
      // 只有 agent-a 已经开始运行（订阅到了流式事件），agent-b 对应的子代理事件尚未到达。
      const saA = makeSA({ agentId: "agent-a", toolCallId: "tc-a", isRunning: true });
      const subAgents = new Map([["agent-a", saA]]);

      const tcB = { id: "tc-b", name: "agent" };
      // 旧实现会把"唯一运行中的子代理"错误地匹配给 tcB；toolCallId 已知时必须拒绝匹配。
      expect(getSubAgentForToolCall(tcB, subAgents)).toBeUndefined();
    });

    it("toolCallId 已知但尚未匹配到任何子代理时，不回退到 result/arguments 之外的猜测", () => {
      const saA = makeSA({ agentId: "agent-a", toolCallId: "tc-a", isRunning: false });
      const subAgents = new Map([["agent-a", saA]]);

      const tcB = { id: "tc-b", name: "agent" };
      expect(getSubAgentForToolCall(tcB, subAgents)).toBeUndefined();
    });
  });

  describe("路径 2：回退到持久化 subAgentDetails", () => {
    it("无流式 subAgents 时从 subAgentDetails 构建状态", () => {
      const result = getSubAgentForToolCall({
        name: "agent",
        subAgentDetails: {
          agentId: "agent-persisted",
          description: "Persisted agent",
          messages: [{ content: "hello", toolCalls: [] }],
          usage: { inputTokens: 100, outputTokens: 50 },
        },
      });
      expect(result).toBeDefined();
      expect(result!.agentId).toBe("agent-persisted");
      expect(result!.description).toBe("Persisted agent");
      expect(result!.isRunning).toBe(false);
      expect(result!.completedMessages).toHaveLength(1);
      expect(result!.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
    });
  });

  describe("完整生命周期模拟", () => {
    it("模拟 sub-agent 从启动到完成的全流程", () => {
      const subAgents = new Map<string, SubAgentState>();
      const tc = { name: "agent", arguments: JSON.stringify({ prompt: "do something", description: "test" }) };

      expect(getSubAgentForToolCall(tc, subAgents)).toBeUndefined();

      const sa = makeSA({ agentId: "sa-1", isRunning: true });
      subAgents.set("sa-1", sa);
      expect(getSubAgentForToolCall(tc, subAgents)).toBe(sa);

      sa.isRunning = false;
      const matched = getSubAgentForToolCall(tc, subAgents);
      expect(matched).toBe(sa);

      const tcWithResult = { ...tc, result: "[agentId: sa-1]\n\nTask done." };
      expect(getSubAgentForToolCall(tcWithResult, subAgents)).toBe(sa);

      const tcPersisted = {
        name: "agent",
        result: "[agentId: sa-1]\n\nTask done.",
        subAgentDetails: {
          agentId: "sa-1",
          description: "test",
          messages: [{ content: "Task done.", toolCalls: [] }],
        },
      };
      const fromPersisted = getSubAgentForToolCall(tcPersisted);
      expect(fromPersisted).toBeDefined();
      expect(fromPersisted!.agentId).toBe("sa-1");
    });

    it("模拟完整渲染管线：streaming messages → mergeToolResults → getSubAgentForToolCall", () => {
      const subAgents = new Map<string, SubAgentState>();
      const agentToolCall: ToolCall = {
        id: "tc-agent",
        name: "agent",
        arguments: '{"prompt":"do","description":"test"}',
        status: "running",
      };
      const assistantMsg: ChatMessage = {
        id: "msg-1",
        conversationId: "conv-1",
        role: "assistant",
        content: "",
        toolCalls: [agentToolCall],
        createtime: Date.now(),
      };
      const streamingMessages: ChatMessage[] = [
        { id: "u-1", conversationId: "conv-1", role: "user", content: "hello", createtime: Date.now() },
        assistantMsg,
      ];

      let merged = mergeToolResults(streamingMessages);
      let mergedTc = merged.find((m) => m.role === "assistant")!.toolCalls![0];
      expect(getSubAgentForToolCall(mergedTc, subAgents)).toBeUndefined();

      // 真实流程中，子代理事件从第一次到达起就带着发起它的 toolCallId（见 chat_service.ts 的 subSendEvent）
      const sa = makeSA({ agentId: "sa-1", toolCallId: "tc-agent", isRunning: true });
      subAgents.set("sa-1", sa);
      merged = mergeToolResults(streamingMessages);
      mergedTc = merged.find((m) => m.role === "assistant")!.toolCalls![0];
      expect(getSubAgentForToolCall(mergedTc, subAgents)).toBe(sa);

      sa.isRunning = false;
      merged = mergeToolResults(streamingMessages);
      mergedTc = merged.find((m) => m.role === "assistant")!.toolCalls![0];
      expect(getSubAgentForToolCall(mergedTc, subAgents)).toBe(sa);

      agentToolCall.result = "[agentId: sa-1]\n\nTask done.";
      agentToolCall.status = "completed";
      merged = mergeToolResults(streamingMessages);
      mergedTc = merged.find((m) => m.role === "assistant")!.toolCalls![0];
      expect(getSubAgentForToolCall(mergedTc, subAgents)).toBe(sa);

      const newAssistant: ChatMessage = {
        id: "msg-2",
        conversationId: "conv-1",
        role: "assistant",
        content: "I completed the sub-task.",
        createtime: Date.now(),
      };
      streamingMessages.push(newAssistant);
      merged = mergeToolResults(streamingMessages);
      mergedTc = merged.find((m) => m.id === "msg-1")!.toolCalls![0];
      expect(getSubAgentForToolCall(mergedTc, subAgents)).toBe(sa);

      const storedMessages: ChatMessage[] = [
        { id: "u-1", conversationId: "conv-1", role: "user", content: "hello", createtime: Date.now() },
        {
          id: "msg-1",
          conversationId: "conv-1",
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: "tc-agent",
              name: "agent",
              arguments: '{"prompt":"do","description":"test"}',
              status: "completed",
              subAgentDetails: {
                agentId: "sa-1",
                description: "test",
                messages: [{ content: "Task done.", toolCalls: [] }],
              },
            },
          ],
          createtime: Date.now(),
        },
        {
          id: "t-1",
          conversationId: "conv-1",
          role: "tool",
          content: "[agentId: sa-1]\n\nTask done.",
          toolCallId: "tc-agent",
          createtime: Date.now(),
        },
        {
          id: "msg-2",
          conversationId: "conv-1",
          role: "assistant",
          content: "I completed the sub-task.",
          createtime: Date.now(),
        },
      ];
      merged = mergeToolResults(storedMessages);
      const loadedTc = merged.find((m) => m.id === "msg-1")!.toolCalls![0];
      expect(loadedTc.result).toBe("[agentId: sa-1]\n\nTask done.");
      expect(getSubAgentForToolCall(loadedTc)).toBeDefined();
      expect(getSubAgentForToolCall(loadedTc)!.agentId).toBe("sa-1");
      expect(getSubAgentForToolCall(loadedTc, subAgents)).toBe(sa);
    });
  });
});
