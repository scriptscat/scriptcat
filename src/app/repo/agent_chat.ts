import type { Conversation, ChatMessage } from "@App/app/service/agent/core/types";
import type { Task } from "@App/app/service/agent/core/tools/task_tools";
import { OPFSRepo } from "./opfs_repo";
import { writeWorkspaceFile, getWorkspaceRoot, getDirectory } from "@App/app/service/agent/core/opfs_helpers";
import { uuidv4 } from "@App/pkg/utils/uuid";
import { RevisionConflictError } from "./revision";

const CONVERSATIONS_FILE = "conversations.json";
const MESSAGES_DIR = "data";
const ATTACHMENTS_DIR = "attachments";
const TASKS_DIR = "tasks";

export type MessageSnapshot = {
  generation: string;
  revision: number;
  messages: ChatMessage[];
};

export type ConversationMutationGuard = {
  generation: string;
  expectedRevision?: number;
  preserveAttachmentIds?: string[];
};

function normalizeConversation(conversation: Conversation): Conversation {
  return {
    ...conversation,
    generation: conversation.generation || `legacy:${conversation.id}`,
    revision: conversation.revision ?? 0,
  };
}

function isMessageSnapshot(value: ChatMessage[] | MessageSnapshot): value is MessageSnapshot {
  return !Array.isArray(value);
}

export function collectMessageAttachmentIds(messages: ChatMessage[]): Set<string> {
  const result = new Set<string>();
  const collectToolCalls = (toolCalls: NonNullable<ChatMessage["toolCalls"]>) => {
    for (const toolCall of toolCalls) {
      for (const attachmentId of toolCall.ownedAttachmentIds || []) result.add(attachmentId);
      for (const subMessage of toolCall.subAgentDetails?.messages || []) {
        collectToolCalls(subMessage.toolCalls);
      }
    }
  };
  for (const message of messages) {
    for (const attachmentId of message.ownedAttachmentIds || []) result.add(attachmentId);
    collectToolCalls(message.toolCalls || []);
  }
  return result;
}

// 目录结构：agents/conversations/
//            agents/conversations/conversations.json       - 会话列表
//            agents/conversations/data/{id}.json           - 每个会话的消息
//            agents/workspace/uploads/{id}                 - 附件二进制数据（LLM 可通过 opfs_read 访问）
//            agents/conversations/attachments/{id}         - 旧路径（兼容读取）
export class AgentChatRepo extends OPFSRepo {
  constructor() {
    super("conversations");
  }

  // 获取所有会话列表
  async listConversations(): Promise<Conversation[]> {
    return (await this.readJsonFile<Conversation[]>(CONVERSATIONS_FILE, [])).map(normalizeConversation);
  }

  async createConversation(conversation: Conversation): Promise<Conversation> {
    return this.withFileLock(`lifecycle:${conversation.id}`, async () => {
      const created = normalizeConversation({ ...conversation, generation: uuidv4(), revision: 1 });
      await this.withFileLock(CONVERSATIONS_FILE, async () => {
        const conversations = (await this.readJsonFile<Conversation[]>(CONVERSATIONS_FILE, [])).map(
          normalizeConversation
        );
        if (conversations.some((item) => item.id === created.id)) {
          throw new RevisionConflictError(`Conversation "${created.id}" already exists`);
        }
        conversations.unshift(created);
        await this.writeJsonFile(CONVERSATIONS_FILE, conversations);
      });

      // Reusing an explicitly supplied ID starts a fresh generation with no legacy child state.
      const messagesDir = await this.getChildDir(MESSAGES_DIR);
      const tasksDir = await this.getChildDir(TASKS_DIR);
      await this.deleteFile(`${created.id}.json`, messagesDir);
      await this.deleteFile(`${created.id}.json`, tasksDir);
      return created;
    });
  }

  // 更新现有会话。generation/revision 都必须匹配，绝不以 upsert 语义复活已删除记录。
  // conversations.json 被 Options 页与 Service Worker 两个上下文共享，所有读-改-写
  // 都必须在同一把跨上下文排它锁内执行，否则双方会基于同一旧快照互相覆盖（见 finding 1）
  async saveConversation(conversation: Conversation): Promise<Conversation> {
    return this.withFileLock(`lifecycle:${conversation.id}`, async () => {
      return this.withFileLock(CONVERSATIONS_FILE, async () => {
        const conversations = (await this.readJsonFile<Conversation[]>(CONVERSATIONS_FILE, [])).map(
          normalizeConversation
        );
        const index = conversations.findIndex((item) => item.id === conversation.id);
        const current = index >= 0 ? conversations[index] : undefined;
        if (
          !current ||
          !conversation.generation ||
          conversation.generation !== current.generation ||
          conversation.revision !== current.revision
        ) {
          throw new RevisionConflictError(`Conversation "${conversation.id}" changed or was deleted`);
        }
        const saved = normalizeConversation({ ...conversation, revision: current.revision! + 1 });
        conversations[index] = saved;
        await this.writeJsonFile(CONVERSATIONS_FILE, conversations);
        Object.assign(conversation, saved);
        return saved;
      });
    });
  }

  // 删除会话及其消息和附件
  async deleteConversation(id: string, guard?: ConversationMutationGuard): Promise<void> {
    await this.withFileLock(`lifecycle:${id}`, async () => {
      let deleted: Conversation | undefined;
      await this.withFileLock(CONVERSATIONS_FILE, async () => {
        const conversations = (await this.readJsonFile<Conversation[]>(CONVERSATIONS_FILE, [])).map(
          normalizeConversation
        );
        const index = conversations.findIndex((item) => item.id === id);
        const current = index >= 0 ? conversations[index] : undefined;
        if (!current) return;
        if (
          guard &&
          (current.generation !== guard.generation ||
            (guard.expectedRevision !== undefined && current.revision !== guard.expectedRevision))
        ) {
          throw new RevisionConflictError(`Conversation "${id}" changed before deletion`);
        }
        deleted = current;
        conversations.splice(index, 1);
        await this.writeJsonFile(CONVERSATIONS_FILE, conversations);
      });
      if (!deleted) return;

      const messagesDir = await this.getChildDir(MESSAGES_DIR);
      const stored = await this.readMessageSnapshot(id, deleted.generation!, messagesDir);
      await this.deleteAttachments([...collectMessageAttachmentIds(stored.messages)]);
      await this.deleteFile(`${id}.json`, messagesDir);
      const tasksDir = await this.getChildDir(TASKS_DIR);
      await this.deleteFile(`${id}.json`, tasksDir);
    });
  }

  // 获取指定会话的所有消息
  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    try {
      return (await this.getMessageSnapshot(conversationId)).messages;
    } catch (error) {
      if (error instanceof RevisionConflictError) return [];
      throw error;
    }
  }

  async getMessageSnapshot(conversationId: string, generation?: string): Promise<MessageSnapshot> {
    return this.withFileLock(`lifecycle:${conversationId}`, async () => {
      const current = await this.requireConversation(conversationId, generation);
      return this.withFileLock(`messages:${conversationId}`, async () => {
        const messagesDir = await this.getChildDir(MESSAGES_DIR);
        return this.readMessageSnapshot(conversationId, current.generation!, messagesDir);
      });
    });
  }

  // 追加消息（读-改-写，须持有该会话消息文件的跨上下文排它锁，见 finding 1）
  async appendMessage(message: ChatMessage, generation?: string): Promise<MessageSnapshot> {
    return this.withFileLock(`lifecycle:${message.conversationId}`, async () => {
      const current = await this.requireConversation(message.conversationId, generation);
      return this.withFileLock(`messages:${message.conversationId}`, async () => {
        const messagesDir = await this.getChildDir(MESSAGES_DIR);
        const snapshot = await this.readMessageSnapshot(message.conversationId, current.generation!, messagesDir);
        // Callers retry final-message persistence with the same stable ID. If close() committed but surfaced an
        // ambiguous error, the retry must observe the committed message instead of appending a duplicate.
        if (snapshot.messages.some((item) => item.id === message.id)) return snapshot;
        const saved = { ...snapshot, revision: snapshot.revision + 1, messages: [...snapshot.messages, message] };
        await this.writeJsonFile(`${message.conversationId}.json`, saved, messagesDir);
        return saved;
      });
    });
  }

  // 更新消息（按 id 匹配；读-改-写，同上须持锁）
  async updateMessage(message: ChatMessage, generation?: string): Promise<MessageSnapshot> {
    return this.withFileLock(`lifecycle:${message.conversationId}`, async () => {
      const current = await this.requireConversation(message.conversationId, generation);
      return this.withFileLock(`messages:${message.conversationId}`, async () => {
        const messagesDir = await this.getChildDir(MESSAGES_DIR);
        const snapshot = await this.readMessageSnapshot(message.conversationId, current.generation!, messagesDir);
        const messages = [...snapshot.messages];
        const index = messages.findIndex((item) => item.id === message.id);
        if (index < 0) return snapshot;
        messages[index] = message;
        const saved = { ...snapshot, revision: snapshot.revision + 1, messages };
        await this.writeJsonFile(`${message.conversationId}.json`, saved, messagesDir);
        return saved;
      });
    });
  }

  /** Persist one assistant tool-call message and its complete tool-result group in one file commit. */
  async commitToolRound(
    assistantMessage: ChatMessage,
    toolMessages: ChatMessage[],
    generation?: string
  ): Promise<MessageSnapshot> {
    const conversationId = assistantMessage.conversationId;
    return this.withFileLock(`lifecycle:${conversationId}`, async () => {
      const current = await this.requireConversation(conversationId, generation);
      return this.withFileLock(`messages:${conversationId}`, async () => {
        const messagesDir = await this.getChildDir(MESSAGES_DIR);
        const snapshot = await this.readMessageSnapshot(conversationId, current.generation!, messagesDir);
        const groupIds = new Set([assistantMessage.id, ...toolMessages.map((message) => message.id)]);
        const messages = snapshot.messages.filter((message) => !groupIds.has(message.id));
        messages.push(assistantMessage, ...toolMessages);
        const saved = { ...snapshot, revision: snapshot.revision + 1, messages };
        await this.writeJsonFile(`${conversationId}.json`, saved, messagesDir);
        return saved;
      });
    });
  }

  // 保存整个消息列表（用于批量更新）。整份覆写虽无读阶段，但仍须与其它读-改-写同锁排队，
  // 否则可能穿插进别人临界区的读与写之间。
  // signal 可选：传入时若在写入落定前已 abort，则放弃这次整份覆写而不是让它继续提交
  // （OPFS createWritable() 本身是事务性的，写入的是临时副本，abort 不会影响已持久化的旧内容，见 finding 4）
  async saveMessages(
    conversationId: string,
    messages: ChatMessage[],
    signal?: AbortSignal,
    guard?: ConversationMutationGuard
  ): Promise<MessageSnapshot> {
    return this.withFileLock(`lifecycle:${conversationId}`, async () => {
      const current = await this.requireConversation(conversationId, guard?.generation);
      return this.withFileLock(`messages:${conversationId}`, async () => {
        const messagesDir = await this.getChildDir(MESSAGES_DIR);
        const snapshot = await this.readMessageSnapshot(conversationId, current.generation!, messagesDir);
        if (guard?.expectedRevision !== undefined && snapshot.revision !== guard.expectedRevision) {
          throw new RevisionConflictError(`Messages for conversation "${conversationId}" changed`);
        }
        const saved = { generation: current.generation!, revision: snapshot.revision + 1, messages };
        await this.writeJsonFile(`${conversationId}.json`, saved, messagesDir, signal);
        const retainedAttachments = collectMessageAttachmentIds(messages);
        for (const attachmentId of guard?.preserveAttachmentIds || []) retainedAttachments.add(attachmentId);
        const removedAttachments = [...collectMessageAttachmentIds(snapshot.messages)].filter(
          (id) => !retainedAttachments.has(id)
        );
        await this.deleteAttachments(removedAttachments);
        return saved;
      });
    });
  }

  private async requireConversation(id: string, generation?: string): Promise<Conversation> {
    const conversations = (await this.readJsonFile<Conversation[]>(CONVERSATIONS_FILE, [])).map(normalizeConversation);
    const current = conversations.find((item) => item.id === id);
    if (!current || (generation !== undefined && current.generation !== generation)) {
      throw new RevisionConflictError(`Conversation "${id}" changed or was deleted`);
    }
    return current;
  }

  private async readMessageSnapshot(
    conversationId: string,
    generation: string,
    messagesDir: FileSystemDirectoryHandle
  ): Promise<MessageSnapshot> {
    const stored = await this.readJsonFile<ChatMessage[] | MessageSnapshot>(`${conversationId}.json`, [], messagesDir);
    if (!isMessageSnapshot(stored)) return { generation, revision: 0, messages: stored };
    if (stored.generation !== generation) return { generation, revision: 0, messages: [] };
    return stored;
  }

  // ---- 附件存储 ----
  // 新路径: agents/workspace/uploads/{id}（LLM 可通过 opfs_read 访问）
  // 旧路径: agents/conversations/attachments/{id}（兼容读取）

  // 保存附件数据到 workspace/uploads（支持 base64/data URL 字符串或 Blob）
  async saveAttachment(id: string, data: string | Blob): Promise<number> {
    const result = await writeWorkspaceFile(`uploads/${id}`, data);
    return result.size;
  }

  // 读取附件数据为 Blob（先查 workspace 新路径，fallback 旧路径）
  async getAttachment(id: string): Promise<Blob | null> {
    // 新路径: agents/workspace/uploads/{id}
    try {
      const workspace = await getWorkspaceRoot();
      const dir = await getDirectory(workspace, "uploads");
      return await (await dir.getFileHandle(id)).getFile();
    } catch {
      // 新路径不存在，尝试旧路径
    }
    // 旧路径回退: agents/conversations/attachments/{id}
    try {
      const dir = await this.getChildDir(ATTACHMENTS_DIR);
      return await (await dir.getFileHandle(id)).getFile();
    } catch {
      return null;
    }
  }

  // 删除单个附件（同时清理新旧路径）
  async deleteAttachment(id: string): Promise<void> {
    // 新路径: agents/workspace/uploads/{id}
    try {
      const workspace = await getWorkspaceRoot();
      const dir = await getDirectory(workspace, "uploads");
      await dir.removeEntry(id);
    } catch {
      // 新路径不存在则忽略
    }
    // 旧路径: agents/conversations/attachments/{id}
    try {
      const dir = await this.getChildDir(ATTACHMENTS_DIR);
      await dir.removeEntry(id);
    } catch {
      // 旧路径不存在则忽略
    }
  }

  // 删除会话关联的所有附件（需传入附件 ID 列表）
  async deleteAttachments(ids: string[]): Promise<void> {
    for (const id of ids) {
      await this.deleteAttachment(id);
    }
  }

  // ---- 任务 (task_tools) 存储 ----

  // 获取会话关联的任务列表
  async getTasks(conversationId: string, generation?: string): Promise<Task[]> {
    return this.withFileLock(`lifecycle:${conversationId}`, async () => {
      await this.requireConversation(conversationId, generation);
      const tasksDir = await this.getChildDir(TASKS_DIR);
      return this.readJsonFile<Task[]>(`${conversationId}.json`, [], tasksDir);
    });
  }

  // 保存会话关联的任务列表
  async saveTasks(conversationId: string, tasks: Task[], signal?: AbortSignal, generation?: string): Promise<void> {
    await this.withFileLock(`lifecycle:${conversationId}`, async () => {
      await this.requireConversation(conversationId, generation);
      await this.withFileLock(`tasks:${conversationId}`, async () => {
        const tasksDir = await this.getChildDir(TASKS_DIR);
        await this.writeJsonFile(`${conversationId}.json`, tasks, tasksDir, signal);
      });
    });
  }

  // 删除会话关联的任务
  async deleteTasks(conversationId: string): Promise<void> {
    await this.withFileLock(`lifecycle:${conversationId}`, async () => {
      await this.requireConversation(conversationId);
      const tasksDir = await this.getChildDir(TASKS_DIR);
      await this.deleteFile(`${conversationId}.json`, tasksDir);
    });
  }
}

// 模块级单例：AgentChatRepo 是 OPFS 的无状态薄包装，无需每处 new。
// 子服务直接 import 使用，测试通过 vi.mock 替换整个模块。
export const agentChatRepo = new AgentChatRepo();
