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
    task: InternalAgentTask
  ): Promise<{ conversationId: string; usage?: { inputTokens: number; outputTokens: number } }> {
    const model = await this.orchestrator.getModel(task.modelId);

    // 解析 Skills
    const { promptSuffix, metaTools } = this.skillService.resolveSkills(task.skills);

    // 定时任务也独享 SessionToolRegistry，防止和前台聊天会话互相覆盖 meta-tool 闭包
    const sessionRegistry = new SessionToolRegistry(this.toolRegistry);
    for (const mt of metaTools) {
      sessionRegistry.register("skill", mt.definition, mt.executor);
    }

    try {
      let conversationId: string;
      const messages: ChatRequest["messages"] = [];

      if (task.conversationId) {
        // 续接已有对话
        conversationId = task.conversationId;
        const conv = await this.getConversation(conversationId);

        const systemContent = buildSystemPrompt({
          userSystem: conv?.system,
          skillSuffix: promptSuffix,
        });
        messages.push({ role: "system", content: systemContent });

        // 加载历史消息
        if (conv) {
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

          for (const msg of existingMessages) {
            if (msg.role === "system") continue;
            messages.push({
              role: msg.role,
              content: msg.content,
              toolCallId: msg.toolCallId,
              toolCalls: msg.toolCalls,
            });
          }
        }
      } else {
        // 创建新对话
        conversationId = uuidv4();
        const conv: Conversation = {
          id: conversationId,
          title: task.name,
          modelId: model.id,
          skills: task.skills,
          createtime: Date.now(),
          updatetime: Date.now(),
        };
        await this.repo.saveConversation(conv);

        const systemContent = buildSystemPrompt({ skillSuffix: promptSuffix });
        messages.push({ role: "system", content: systemContent });
      }

      // 添加用户消息（task.prompt）
      const userContent = task.prompt || task.name;
      messages.push({ role: "user", content: userContent });
      await this.repo.appendMessage({
        id: uuidv4(),
        conversationId,
        role: "user",
        content: userContent,
        createtime: Date.now(),
      });

      // 收集 usage
      const totalUsage = { inputTokens: 0, outputTokens: 0 };
      const abortController = new AbortController();

      const sendEvent = (event: ChatStreamEvent) => {
        // 定时任务无 UI 连接，但需要收集 usage
        if (event.type === "done" && event.usage) {
          totalUsage.inputTokens += event.usage.inputTokens;
          totalUsage.outputTokens += event.usage.outputTokens;
        }
      };

      await this.orchestrator.callLLMWithToolLoop({
        toolRegistry: sessionRegistry,
        model,
        messages,
        maxIterations: task.maxIterations || 10,
        sendEvent,
        signal: abortController.signal,
        scriptToolCallback: null,
        conversationId,
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
  async emitTaskEvent(task: EventAgentTask): Promise<void> {
    const trigger: AgentTaskTrigger = {
      taskId: task.id,
      name: task.name,
      crontab: task.crontab,
      triggeredAt: Date.now(),
    };

    // 通过 offscreen → sandbox → 脚本 EventEmitter 链路通知脚本
    await sendMessage(this.sender, "offscreen/runtime/emitEvent", {
      uuid: task.sourceScriptUuid,
      event: "agentTask",
      eventId: task.id,
      data: trigger,
    });

    if (task.notify) {
      InfoNotification(task.name, "定时任务已触发");
    }
  }

  private async getConversation(id: string): Promise<Conversation | null> {
    const conversations = await this.repo.listConversations();
    return conversations.find((c) => c.id === id) || null;
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
        await this.taskRepo.saveTask(task);
        return task;
      }
      case "update": {
        const existing = await this.taskRepo.getTask(params.id);
        if (!existing) throw new Error("Task not found");
        const updated = { ...existing, ...params.task, updatetime: Date.now() } as AgentTask;
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
        await this.taskRepo.saveTask(updated);
        return updated;
      }
      case "delete":
        await this.taskRepo.removeTask(params.id);
        return true;
      case "enable": {
        const task = await this.taskRepo.getTask(params.id);
        if (!task) throw new Error("Task not found");
        task.enabled = params.enabled;
        task.updatetime = Date.now();
        if (task.enabled) {
          try {
            const info = nextTimeInfo(task.crontab);
            task.nextruntime = info.next.toMillis();
          } catch {
            task.nextruntime = undefined;
          }
        }
        await this.taskRepo.saveTask(task);
        return task;
      }
      case "runNow": {
        const task = await this.taskRepo.getTask(params.id);
        if (!task) throw new Error("Task not found");
        // 不 await，立即返回
        this.taskScheduler?.executeTask(task).catch(() => {});
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
