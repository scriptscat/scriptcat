import type { MessageSend } from "@Packages/message/types";
import type {
  AgentModelConfig,
  AgentTask,
  AgentTaskApiRequest,
  AgentTaskTrigger,
  ChatRequest,
  ChatStreamEvent,
  Conversation,
  EventAgentTask,
  InternalAgentTask,
} from "@App/app/service/agent/core/types";
import type { ScriptToolCallback, ToolExecutorLike, ToolRegistry } from "@App/app/service/agent/core/tool_registry";
import { SessionToolRegistry } from "@App/app/service/agent/core/session_tool_registry";
import type { SkillService } from "./skill_service";
import type { AgentTaskRepo, AgentTaskRunRepo } from "@App/app/repo/agent_task";
import type { AgentTaskScheduler } from "@App/app/service/agent/core/task_scheduler";
import type { AgentChatRepo } from "@App/app/repo/agent_chat";
import { buildSystemPrompt } from "@App/app/service/agent/core/system_prompt";
import { uuidv4 } from "@App/pkg/utils/uuid";
import { nextTimeInfo } from "@App/pkg/utils/cron";
import { InfoNotification } from "@App/app/service/service_worker/utils";
import { sendMessage } from "@Packages/message/client";
import { normalizeChatMaxIterations } from "@App/app/service/agent/core/agent_config";
import { toLLMMessages } from "@App/app/service/agent/core/persisted_messages";
import { stackAsyncTask } from "@App/pkg/utils/async_queue";
import { conversationChatLockKey } from "./chat_service";
import { raceWithAbort, throwIfAborted } from "@App/app/service/agent/core/abort_utils";

/** 供 TaskService 调用的 orchestrator 能力 */
export interface TaskOrchestrator {
  getModel(modelId?: string): Promise<AgentModelConfig>;
  callLLMWithToolLoop(params: {
    toolRegistry: ToolExecutorLike;
    model: AgentModelConfig;
    messages: ChatRequest["messages"];
    maxIterations: number;
    sendEvent: (event: ChatStreamEvent) => void;
    signal: AbortSignal;
    scriptToolCallback: ScriptToolCallback | null;
    conversationId: string;
    conversationGeneration: string;
    rehydratedHistory?: boolean;
    throwOnTerminalError?: boolean;
  }): Promise<void>;
}

export class AgentTaskService {
  // 循环依赖通过 setScheduler 延迟注入
  private taskScheduler?: AgentTaskScheduler;

  constructor(
    private sender: MessageSend,
    private repo: AgentChatRepo,
    private toolRegistry: ToolRegistry,
    private skillService: SkillService,
    private orchestrator: TaskOrchestrator,
    private taskRepo: AgentTaskRepo,
    private taskRunRepo: AgentTaskRunRepo
  ) {}

  // 延迟注入 scheduler（避免循环依赖：AgentTaskScheduler ↔ AgentTaskService）
  setScheduler(scheduler: AgentTaskScheduler) {
    this.taskScheduler = scheduler;
  }

  // internal 模式定时任务执行：构建对话并调用 LLM
  async executeInternalTask(
    task: InternalAgentTask,
    signal = new AbortController().signal
  ): Promise<{ conversationId: string; usage?: { inputTokens: number; outputTokens: number } }> {
    throwIfAborted(signal);
    const model = await this.orchestrator.getModel(task.modelId);

    // 解析 Skills
    const { promptSuffix, metaTools } = this.skillService.resolveSkills(task.skills);

    // 定时任务也独享 SessionToolRegistry，防止和前台聊天会话互相覆盖 meta-tool 闭包
    const sessionRegistry = new SessionToolRegistry(this.toolRegistry);
    for (const mt of metaTools) {
      sessionRegistry.register("skill", mt.definition, mt.executor);
    }

    // 与同一会话的 UI 聊天 / compact / clearMessages 共用同一把按 conversationId 的队列锁：
    // appendMessage 是读-改-写，续接已有会话的定时任务若不排队，会与进行中的对话互相覆盖丢消息
    const conversationId = task.conversationId || uuidv4();
    return stackAsyncTask(conversationChatLockKey(conversationId), () =>
      this.executeInternalTaskLocked(task, conversationId, model, promptSuffix, metaTools, sessionRegistry, signal)
    );
  }

  private async executeInternalTaskLocked(
    task: InternalAgentTask,
    conversationId: string,
    model: AgentModelConfig,
    promptSuffix: string,
    metaTools: ReturnType<SkillService["resolveSkills"]>["metaTools"],
    sessionRegistry: SessionToolRegistry,
    signal: AbortSignal
  ): Promise<{ conversationId: string; usage?: { inputTokens: number; outputTokens: number } }> {
    try {
      throwIfAborted(signal);
      const messages: ChatRequest["messages"] = [];
      let conversation: Conversation;

      if (task.conversationId) {
        // 续接已有对话
        const conv = await this.getConversation(conversationId);
        if (!conv?.generation) throw new Error("Conversation not found");
        // task.conversationGeneration 记录任务绑定该对话时的 generation；若当前 generation
        // 不一致，说明该会话已被删除重建为无关的新一代，绝不能静默续接（见 finding 1）
        if (task.conversationGeneration && conv.generation !== task.conversationGeneration) {
          throw new Error("Conversation generation mismatch; the bound conversation was deleted and recreated");
        }
        conversation = conv;

        const systemContent = buildSystemPrompt({
          userSystem: conv?.system,
          skillSuffix: promptSuffix,
        });
        messages.push({ role: "system", content: systemContent });

        // 加载历史消息
        {
          const existingMessages = await this.repo.getMessages(conversationId);

          // 预加载之前已加载的 skill 的工具
          if (metaTools.length > 0) {
            const loadSkillMeta = metaTools.find((mt) => mt.definition.name === "load_skill");
            if (loadSkillMeta) {
              for (const msg of existingMessages) {
                if (msg.role === "assistant" && msg.toolCalls) {
                  for (const tc of msg.toolCalls) {
                    if (tc.name === "load_skill") {
                      try {
                        const args = JSON.parse(tc.arguments || "{}");
                        if (args.skill_name) {
                          await loadSkillMeta.executor.execute({ skill_name: args.skill_name });
                        }
                      } catch {
                        // 跳过
                      }
                    }
                  }
                }
              }
            }
          }

          messages.push(...toLLMMessages(existingMessages).filter((message) => message.role !== "system"));
        }
      } else {
        // 创建新对话
        const conv: Conversation = {
          id: conversationId,
          title: task.name,
          modelId: model.id,
          skills: task.skills,
          createtime: Date.now(),
          updatetime: Date.now(),
        };
        conversation = await this.repo.createConversation(conv);

        const systemContent = buildSystemPrompt({ skillSuffix: promptSuffix });
        messages.push({ role: "system", content: systemContent });
      }

      // 添加用户消息（task.prompt）
      const userContent = task.prompt || task.name;
      messages.push({ role: "user", content: userContent });
      await this.repo.appendMessage(
        {
          id: uuidv4(),
          conversationId,
          role: "user",
          content: userContent,
          createtime: Date.now(),
        },
        conversation.generation
      );

      // 收集 usage
      const totalUsage = { inputTokens: 0, outputTokens: 0 };
      const sendEvent = (event: ChatStreamEvent) => {
        // 定时任务无 UI 连接，但需要收集 usage
        if ((event.type === "done" || event.type === "error") && event.usage) {
          totalUsage.inputTokens += event.usage.inputTokens;
          totalUsage.outputTokens += event.usage.outputTokens;
        }
      };

      await this.orchestrator.callLLMWithToolLoop({
        toolRegistry: sessionRegistry,
        model,
        messages,
        maxIterations: normalizeChatMaxIterations(task.maxIterations ?? 10),
        sendEvent,
        signal,
        scriptToolCallback: null,
        conversationId,
        conversationGeneration: conversation.generation!,
        rehydratedHistory: Boolean(task.conversationId),
        throwOnTerminalError: true,
      });

      // 通知
      if (task.notify) {
        InfoNotification(task.name, "定时任务执行完成");
      }

      return { conversationId, usage: totalUsage };
    } finally {
      // sessionRegistry 超出作用域后由 GC 清理，无需手动 unregister
    }
  }

  // event 模式定时任务：通知脚本
  async emitTaskEvent(task: EventAgentTask, signal = new AbortController().signal): Promise<void> {
    throwIfAborted(signal);
    const trigger: AgentTaskTrigger = {
      taskId: task.id,
      name: task.name,
      crontab: task.crontab,
      triggeredAt: Date.now(),
    };

    // 通过 offscreen → sandbox → 脚本 EventEmitter 链路通知脚本
    await raceWithAbort(
      sendMessage(this.sender, "offscreen/runtime/emitEvent", {
        uuid: task.sourceScriptUuid,
        event: "agentTask",
        eventId: task.id,
        data: trigger,
      }),
      signal
    );
    throwIfAborted(signal);

    if (task.notify) {
      InfoNotification(task.name, "定时任务已触发");
    }
  }

  private async getConversation(id: string): Promise<Conversation | null> {
    const conversations = await this.repo.listConversations();
    const conversation = conversations.find((item) => item.id === id);
    if (!conversation) return null;
    return {
      ...conversation,
      generation: conversation.generation || `legacy:${conversation.id}`,
      revision: conversation.revision ?? 0,
    };
  }

  // 处理定时任务 CRUD 及 run 操作
  async handleAgentTask(params: AgentTaskApiRequest): Promise<unknown> {
    switch (params.action) {
      case "list":
        return this.taskRepo.listTasks();
      case "get":
        return this.taskRepo.getTask(params.id);
      case "create": {
        const now = Date.now();
        const task = {
          ...params.task,
          id: uuidv4(),
          createtime: now,
          updatetime: now,
        } as AgentTask;
        // 计算 nextruntime
        if (task.enabled) {
          try {
            const info = nextTimeInfo(task.crontab);
            task.nextruntime = info.next.toMillis();
          } catch {
            // cron 无效，不设置 nextruntime
          }
        }
        // 绑定续接对话时记录当时的 generation，执行期据此拒绝已被删除重建的会话（见 finding 1）
        if (task.mode === "internal" && task.conversationId && !task.conversationGeneration) {
          const conv = await this.getConversation(task.conversationId);
          if (conv?.generation) task.conversationGeneration = conv.generation;
        }
        return this.taskRepo.createTask(task);
      }
      case "update": {
        const existing = await this.taskRepo.getTask(params.id);
        if (!existing) throw new Error("Task not found");
        const updated = {
          ...existing,
          ...params.task,
          id: params.id,
          generation: params.generation,
          revision: params.revision,
          updatetime: Date.now(),
        } as AgentTask;
        // conversationId 变更（或首次绑定）时重新记录 generation，避免沿用旧会话的 generation（见 finding 1）
        if (updated.mode === "internal" && updated.conversationId && "conversationId" in params.task) {
          const conv = await this.getConversation(updated.conversationId);
          updated.conversationGeneration = conv?.generation;
        }
        // 如果 crontab 或 enabled 变化，重新计算 nextruntime
        if (params.task.crontab !== undefined || params.task.enabled !== undefined) {
          if (updated.enabled) {
            try {
              const info = nextTimeInfo(updated.crontab);
              updated.nextruntime = info.next.toMillis();
            } catch {
              updated.nextruntime = undefined;
            }
          }
        }
        return this.taskRepo.saveTask(updated);
      }
      case "delete": {
        await this.taskRepo.removeTask(params.id, params.generation, params.revision);
        this.taskScheduler?.cancelTask(params.id);
        return true;
      }
      case "enable": {
        const task = await this.taskRepo.getTask(params.id);
        if (!task) throw new Error("Task not found");
        const updated = {
          ...task,
          enabled: params.enabled,
          generation: params.generation,
          revision: params.revision,
          updatetime: Date.now(),
        } as AgentTask;
        if (updated.enabled) {
          try {
            const info = nextTimeInfo(updated.crontab);
            updated.nextruntime = info.next.toMillis();
          } catch {
            updated.nextruntime = undefined;
          }
        }
        return this.taskRepo.saveTask(updated);
      }
      case "runNow": {
        const task = await this.taskRepo.getTask(params.id);
        if (!task) throw new Error("Task not found");
        // 不 await，立即返回
        const now = Date.now();
        const claimScheduled = Boolean(task.enabled && task.nextruntime && task.nextruntime <= now);
        this.taskScheduler?.executeTask(task, claimScheduled, now).catch(() => {});
        return true;
      }
      case "listRuns":
        return this.taskRunRepo.listRuns(params.taskId, params.limit);
      case "clearRuns":
        await this.taskRunRepo.clearRuns(params.taskId);
        return true;
      default:
        throw new Error(`Unknown agentTask action: ${(params as any).action}`);
    }
  }
}
