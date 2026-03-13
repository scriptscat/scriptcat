import type { Conversation, ChatMessage } from "@App/app/service/agent/types";
import { OPFSRepo } from "./opfs_repo";

const CONVERSATIONS_FILE = "conversations.json";
const MESSAGES_DIR = "data";
const ATTACHMENTS_DIR = "attachments";

// 目录结构：agents/conversations/
//            agents/conversations/conversations.json       - 会话列表
//            agents/conversations/data/{id}.json           - 每个会话的消息
//            agents/conversations/attachments/{id}         - 附件二进制数据
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

  // 保存附件数据（支持 base64/data URL 字符串或 Blob）
  async saveAttachment(id: string, data: string | Blob): Promise<number> {
    const dir = await this.getChildDir(ATTACHMENTS_DIR);
    const fileHandle = await dir.getFileHandle(id, { create: true });
    const writable = await fileHandle.createWritable();

    let size: number;
    if (data instanceof Blob) {
      await writable.write(data);
      size = data.size;
    } else {
      // 字符串数据（base64/data URL），按原始二进制存储
      const binary = this.dataUrlToBlob(data);
      await writable.write(binary);
      size = binary.size;
    }

    await writable.close();
    return size;
  }

  // 读取附件数据为 Blob
  async getAttachment(id: string): Promise<Blob | null> {
    try {
      const dir = await this.getChildDir(ATTACHMENTS_DIR);
      const fileHandle = await dir.getFileHandle(id);
      return await fileHandle.getFile();
    } catch {
      return null;
    }
  }

  // 删除单个附件
  async deleteAttachment(id: string): Promise<void> {
    const dir = await this.getChildDir(ATTACHMENTS_DIR);
    await this.deleteFile(id, dir);
  }

  // 删除会话关联的所有附件（需传入附件 ID 列表）
  async deleteAttachments(ids: string[]): Promise<void> {
    const dir = await this.getChildDir(ATTACHMENTS_DIR);
    for (const id of ids) {
      await this.deleteFile(id, dir);
    }
  }

  // 将 data URL 或纯 base64 转换为 Blob
  private dataUrlToBlob(data: string): Blob {
    // 匹配 data URL 格式
    const match = data.match(/^data:([^;]+);base64,(.+)$/s);
    if (match) {
      const byteString = atob(match[2]);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      return new Blob([ab], { type: match[1] });
    }
    // 纯文本存储
    return new Blob([data], { type: "application/octet-stream" });
  }
}
