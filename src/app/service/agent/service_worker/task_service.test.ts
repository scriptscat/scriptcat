import { describe, expect, it, vi } from "vitest";
import { AgentTaskService } from "./task_service";
import { conversationChatLockKey } from "./chat_service";
import { stackAsyncTask } from "@App/pkg/utils/async_queue";
import type { EventAgentTask, InternalAgentTask } from "@App/app/service/agent/core/types";

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

  it("【finding 1 回归】任务绑定的会话已被删除重建（generation 不一致）时应拒绝续接，而不是静默写入无关会话", async () => {
    const { service, repo, orchestrator } = createService();
    // 存储里 conv-lock 当前的 generation 是 "gen-b"（被删除重建过）
    repo.listConversations.mockResolvedValue([
      { id: "conv-lock", title: "t", modelId: "m1", generation: "gen-b" },
    ]);

    const task = {
      id: "task-3",
      name: "定时任务",
      mode: "internal",
      prompt: "继续",
      conversationId: "conv-lock",
      // 任务创建时绑定的是旧的一代
      conversationGeneration: "gen-a",
    } as unknown as InternalAgentTask;

    await expect(service.executeInternalTask(task)).rejects.toThrow(/generation/i);
    expect(repo.appendMessage).not.toHaveBeenCalled();
    expect(orchestrator.callLLMWithToolLoop).not.toHaveBeenCalled();
  });
});

describe("AgentTaskService 任务生命周期", () => {
  function createMutationService() {
    const current = {
      id: "task-cas",
      generation: "generation-current",
      revision: 3,
      name: "current",
      crontab: "0 9 * * *",
      mode: "internal",
      prompt: "current",
      enabled: true,
      notify: false,
      nextruntime: Date.now() - 1_000,
      createtime: 1,
      updatetime: 1,
    } as const;
    const taskRepo = {
      getTask: vi.fn().mockResolvedValue(current),
      saveTask: vi.fn(async (candidate: any) => {
        if (candidate.generation !== current.generation || candidate.revision !== current.revision) {
          throw new Error("revision conflict");
        }
        return candidate;
      }),
      removeTask: vi.fn().mockResolvedValue(undefined),
    };
    const scheduler = {
      cancelTask: vi.fn(),
      executeTask: vi.fn().mockResolvedValue(undefined),
    };
    const service = new AgentTaskService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      taskRepo as any,
      {} as any
    );
    service.setScheduler(scheduler as any);
    return { service, taskRepo, scheduler, current };
  }

  it("update 与 enable 必须使用客户端看到的 generation/revision 做 CAS", async () => {
    const { service, taskRepo } = createMutationService();

    await expect(
      service.handleAgentTask({
        action: "update",
        id: "task-cas",
        generation: "generation-current",
        revision: 2,
        task: { name: "stale edit" },
      } as any)
    ).rejects.toThrow("revision conflict");
    await expect(
      service.handleAgentTask({
        action: "enable",
        id: "task-cas",
        generation: "generation-current",
        revision: 2,
        enabled: false,
      } as any)
    ).rejects.toThrow("revision conflict");

    expect(taskRepo.saveTask).toHaveBeenCalledWith(expect.objectContaining({ revision: 2 }));
  });

  it("delete 应先取消活动执行并使用客户端版本删除", async () => {
    const { service, taskRepo, scheduler } = createMutationService();

    await service.handleAgentTask({
      action: "delete",
      id: "task-cas",
      generation: "generation-current",
      revision: 3,
    } as any);

    expect(scheduler.cancelTask).toHaveBeenCalledWith("task-cas");
    expect(taskRepo.removeTask).toHaveBeenCalledWith("task-cas", "generation-current", 3);
  });

  it("runNow 遇到已到期任务时应领取当前槽位而不是随后再由 tick 重复执行", async () => {
    const { service, scheduler, current } = createMutationService();

    await service.handleAgentTask({ action: "runNow", id: current.id });

    expect(scheduler.executeTask).toHaveBeenCalledWith(current, true, expect.any(Number));
  });

  it("事件派发通道无响应时取消信号应立即终止等待", async () => {
    const sender = { sendMessage: vi.fn(() => new Promise(() => {})) } as any;
    const service = new AgentTaskService(sender, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    const task = {
      id: "event-cancel",
      name: "事件任务",
      mode: "event",
      crontab: "0 9 * * *",
      sourceScriptUuid: "script-1",
      enabled: true,
      notify: false,
    } as EventAgentTask;
    const controller = new AbortController();

    const execution = service.emitTaskEvent(task, controller.signal);
    await vi.waitFor(() => expect(sender.sendMessage).toHaveBeenCalledOnce());
    controller.abort();

    await expect(execution).rejects.toThrow("Aborted");
  });
});
