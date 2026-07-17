import { describe, expect, it, vi } from "vitest";
import { AgentTaskService } from "./task_service";
import { conversationChatLockKey } from "./chat_service";
import { stackAsyncTask } from "@App/pkg/utils/async_queue";
import type { InternalAgentTask } from "@App/app/service/agent/core/types";

function createService(overrides?: { appendMessage?: ReturnType<typeof vi.fn> }) {
  const appendMessage = overrides?.appendMessage ?? vi.fn().mockResolvedValue(undefined);
  const repo = {
    appendMessage,
    getMessages: vi.fn().mockResolvedValue([]),
    listConversations: vi.fn().mockResolvedValue([{ id: "conv-lock", title: "t", modelId: "m1" }]),
    createConversation: vi.fn().mockImplementation(async (conversation: any) => ({
      ...conversation,
      generation: "gen-created",
      revision: 1,
    })),
    saveConversation: vi.fn().mockResolvedValue(undefined),
  } as any;
  const orchestrator = {
    getModel: vi.fn().mockResolvedValue({ id: "m1", model: "gpt-4o", provider: "openai" }),
    callLLMWithToolLoop: vi.fn().mockResolvedValue(undefined),
  };
  const skillService = { resolveSkills: vi.fn().mockReturnValue({ promptSuffix: "", metaTools: [] }) } as any;
  const service = new AgentTaskService(
    {} as any,
    repo,
    {} as any,
    skillService,
    orchestrator as any,
    {} as any,
    {} as any
  );
  return { service, repo, orchestrator };
}

describe("AgentTaskService 定时任务与会话锁", () => {
  it("续接已有会话的定时任务必须等待 agent-chat 会话锁释放后才写入消息", async () => {
    const { service, repo } = createService();

    // 模拟一条正在进行的 UI 对话占用同一会话的队列锁
    let releaseLock!: () => void;
    const lockHeld = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const lockTask = stackAsyncTask(conversationChatLockKey("conv-lock"), () => lockHeld);

    const task = {
      id: "task-1",
      name: "定时任务",
      mode: "internal",
      prompt: "继续",
      conversationId: "conv-lock",
    } as unknown as InternalAgentTask;

    const runPromise = service.executeInternalTask(task);

    // 锁被 UI 对话占用期间，定时任务不得写入任何消息（appendMessage 是读改写，会互相覆盖）
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(repo.appendMessage).not.toHaveBeenCalled();

    releaseLock();
    await lockTask;
    const result = await runPromise;

    expect(result.conversationId).toBe("conv-lock");
    expect(repo.appendMessage).toHaveBeenCalledTimes(1);
  });

  it("新建会话的定时任务正常执行并返回新 conversationId", async () => {
    const { service, repo, orchestrator } = createService();
    const task = {
      id: "task-2",
      name: "新任务",
      mode: "internal",
      prompt: "hello",
    } as unknown as InternalAgentTask;

    const result = await service.executeInternalTask(task);

    expect(result.conversationId).toBeTruthy();
    expect(repo.createConversation).toHaveBeenCalled();
    expect(orchestrator.callLLMWithToolLoop).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: result.conversationId, rehydratedHistory: false })
    );
  });
});
