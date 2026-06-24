import { describe, it, expect } from "vitest";
import type { SubAgentState } from "./SubAgentBlock";
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
      // 这是 sub-agent done → tool_call_complete 之间的状态
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
      // result 已设置但 agentId 不匹配 → 不应回退到 1c
      const sa = makeSA({ agentId: "agent-x", isRunning: true });
      const subAgents = new Map([["agent-x", sa]]);
      const result = getSubAgentForToolCall({ name: "agent", result: "[agentId: other]\n\nDone." }, subAgents);
      // 1a 找不到 "other"，1c 不执行因为 result 存在
      expect(result).toBeUndefined();
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

      // 阶段 1：tool_call_start，子代理尚未开始 → subAgents 为空
      expect(getSubAgentForToolCall(tc, subAgents)).toBeUndefined();

      // 阶段 2：第一个子代理事件到达 → isRunning = true
      const sa = makeSA({ agentId: "sa-1", isRunning: true });
      subAgents.set("sa-1", sa);
      expect(getSubAgentForToolCall(tc, subAgents)).toBe(sa);

      // 阶段 3：子代理 done 事件 → isRunning = false，但 tc.result 尚未设置
      sa.isRunning = false;
      const matched = getSubAgentForToolCall(tc, subAgents);
      expect(matched).toBe(sa); // 关键：不应变成 undefined

      // 阶段 4：tool_call_complete → tc.result 设置
      const tcWithResult = { ...tc, result: "[agentId: sa-1]\n\nTask done." };
      expect(getSubAgentForToolCall(tcWithResult, subAgents)).toBe(sa);

      // 阶段 5：对话结束后 loadMessages → 从 subAgentDetails 加载
      const tcPersisted = {
        name: "agent",
        result: "[agentId: sa-1]\n\nTask done.",
        subAgentDetails: {
          agentId: "sa-1",
          description: "test",
          messages: [{ content: "Task done.", toolCalls: [] }],
        },
      };
      // 无流式 subAgents 时也能匹配
      const fromPersisted = getSubAgentForToolCall(tcPersisted);
      expect(fromPersisted).toBeDefined();
      expect(fromPersisted!.agentId).toBe("sa-1");
    });

    it("模拟完整渲染管线：streaming messages → mergeToolResults → getSubAgentForToolCall", () => {
      // 模拟 ChatArea 中的流式消息状态（不含 tool role 消息）
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
      // streaming 期间只有 user + assistant 消息
      const streamingMessages: ChatMessage[] = [
        { id: "u-1", conversationId: "conv-1", role: "user", content: "hello", createtime: Date.now() },
        assistantMsg,
      ];

      // 阶段 1：tool_call_start，子代理尚未启动
      let merged = mergeToolResults(streamingMessages);
      let mergedTc = merged.find((m) => m.role === "assistant")!.toolCalls![0];
      expect(getSubAgentForToolCall(mergedTc, subAgents)).toBeUndefined();

      // 阶段 2：子代理 streaming 中
      const sa = makeSA({ agentId: "sa-1", isRunning: true });
      subAgents.set("sa-1", sa);
      merged = mergeToolResults(streamingMessages);
      mergedTc = merged.find((m) => m.role === "assistant")!.toolCalls![0];
      expect(getSubAgentForToolCall(mergedTc, subAgents)).toBe(sa);

      // 阶段 3：子代理 done，result 尚未到达（关键间隙）
      sa.isRunning = false;
      merged = mergeToolResults(streamingMessages);
      mergedTc = merged.find((m) => m.role === "assistant")!.toolCalls![0];
      expect(getSubAgentForToolCall(mergedTc, subAgents)).toBe(sa);

      // 阶段 4：tool_call_complete → mutation 设置 result
      agentToolCall.result = "[agentId: sa-1]\n\nTask done.";
      agentToolCall.status = "completed";
      merged = mergeToolResults(streamingMessages);
      mergedTc = merged.find((m) => m.role === "assistant")!.toolCalls![0];
      expect(getSubAgentForToolCall(mergedTc, subAgents)).toBe(sa);

      // 阶段 5：new_message 后继续流式（新消息加入，旧消息不变）
      const newAssistant: ChatMessage = {
        id: "msg-2",
        conversationId: "conv-1",
        role: "assistant",
        content: "I completed the sub-task.",
        createtime: Date.now(),
      };
      streamingMessages.push(newAssistant);
      merged = mergeToolResults(streamingMessages);
      // 旧消息的 tc 仍应匹配
      mergedTc = merged.find((m) => m.id === "msg-1")!.toolCalls![0];
      expect(getSubAgentForToolCall(mergedTc, subAgents)).toBe(sa);

      // 阶段 6：loadMessages 后 — 从存储加载（含 tool 消息和 subAgentDetails）
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
      // mergeToolResults 从 tool 消息合并 result
      expect(loadedTc.result).toBe("[agentId: sa-1]\n\nTask done.");
      // 无流式 subAgents 时也应通过 subAgentDetails 匹配
      expect(getSubAgentForToolCall(loadedTc)).toBeDefined();
      expect(getSubAgentForToolCall(loadedTc)!.agentId).toBe("sa-1");
      // 有流式 subAgents 时通过 result 匹配
      expect(getSubAgentForToolCall(loadedTc, subAgents)).toBe(sa);
    });
  });
});
