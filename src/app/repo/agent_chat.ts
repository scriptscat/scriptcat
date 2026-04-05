import type { Conversation, ChatMessage } from "@App/app/service/agent/core/types";
import type { Task } from "@App/app/service/agent/core/tools/task_tools";
import { OPFSRepo } from "./opfs_repo";
import { writeWorkspaceFile, getWorkspaceRoot, getDirectory } from "@App/app/service/agent/core/opfs_helpers";

const CONVERSATIONS_FILE = "conversations.json";
const MESSAGES_DIR = "data";
const ATTACHMENTS_DIR = "attachments";
const TASKS_DIR = "tasks";

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
    return this.readJsonFile<Conversation[]>(CONVERSATIONS_FILE, []);
  }

  // 保存/更新会话
  async saveConversation(conversation: Conversation): Promise<void> {
    const conversations = await this.readJsonFile<Conversation[]>(CONVERSATIONS_FILE, []);
    const index = conversations.findIndex((c) => c.id === conversation.id);
    if (index >= 0) {
      conversations[index] = conversation;
    } else {
      conversations.unshift(conversation);
    }
    await this.writeJsonFile(CONVERSATIONS_FILE, conversations);
  }

  // 删除会话及其消息和附件
  async deleteConversation(id: string): Promise<void> {
    // 清理会话关联的附件
    const messages = await this.getMessages(id);
    const attachmentIds: string[] = [];
    for (const msg of messages) {
      // 扫描 toolCalls 中的附件
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          if (tc.attachments) {
            for (const att of tc.attachments) {
              attachmentIds.push(att.id);
            }
          }
        }
      }
      // 扫描 ContentBlock[] 中的附件
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type !== "text" && "attachmentId" in block) {
            attachmentIds.push(block.attachmentId);
          }
        }
      }
    }
    if (attachmentIds.length > 0) {
      await this.deleteAttachments(attachmentIds);
    }

    const conversations = await this.readJsonFile<Conversation[]>(CONVERSATIONS_FILE, []);
    const filtered = conversations.filter((c) => c.id !== id);
    await this.writeJsonFile(CONVERSATIONS_FILE, filtered);
    // 删除对应消息文件
    const messagesDir = await this.getChildDir(MESSAGES_DIR);
    await this.deleteFile(`${id}.json`, messagesDir);
    // 删除关联的任务数据
    await this.deleteTasks(id).catch(() => {});
  }

  // 获取指定会话的所有消息
  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    const messagesDir = await this.getChildDir(MESSAGES_DIR);
    return this.readJsonFile<ChatMessage[]>(`${conversationId}.json`, [], messagesDir);
  }

  // 追加消息
  async appendMessage(message: ChatMessage): Promise<void> {
    const messagesDir = await this.getChildDir(MESSAGES_DIR);
    const messages = await this.readJsonFile<ChatMessage[]>(`${message.conversationId}.json`, [], messagesDir);
    messages.push(message);
    await this.writeJsonFile(`${message.conversationId}.json`, messages, messagesDir);
  }

  // 更新消息（按 id 匹配）
  async updateMessage(message: ChatMessage): Promise<void> {
    const messagesDir = await this.getChildDir(MESSAGES_DIR);
    const messages = await this.readJsonFile<ChatMessage[]>(`${message.conversationId}.json`, [], messagesDir);
    const index = messages.findIndex((m) => m.id === message.id);
    if (index >= 0) {
      messages[index] = message;
      await this.writeJsonFile(`${message.conversationId}.json`, messages, messagesDir);
    }
  }

  // 保存整个消息列表（用于批量更新）
  async saveMessages(conversationId: string, messages: ChatMessage[]): Promise<void> {
    const messagesDir = await this.getChildDir(MESSAGES_DIR);
    await this.writeJsonFile(`${conversationId}.json`, messages, messagesDir);
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
  async getTasks(conversationId: string): Promise<Task[]> {
    const tasksDir = await this.getChildDir(TASKS_DIR);
    return this.readJsonFile<Task[]>(`${conversationId}.json`, [], tasksDir);
  }

  // 保存会话关联的任务列表
  async saveTasks(conversationId: string, tasks: Task[]): Promise<void> {
    const tasksDir = await this.getChildDir(TASKS_DIR);
    await this.writeJsonFile(`${conversationId}.json`, tasks, tasksDir);
  }

  // 删除会话关联的任务
  async deleteTasks(conversationId: string): Promise<void> {
    const tasksDir = await this.getChildDir(TASKS_DIR);
    await this.deleteFile(`${conversationId}.json`, tasksDir);
  }
}

// 模块级单例：AgentChatRepo 是 OPFS 的无状态薄包装，无需每处 new。
// 子服务直接 import 使用，测试通过 vi.mock 替换整个模块。
export const agentChatRepo = new AgentChatRepo();
