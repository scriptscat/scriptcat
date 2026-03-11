import type { Conversation, ChatMessage } from "@App/app/service/agent/types";
import { OPFSRepo } from "./opfs_repo";

const CONVERSATIONS_FILE = "conversations.json";
const MESSAGES_DIR = "messages";

// 目录结构：agents/conversations/
//            agents/conversations/conversations.json  - 会话列表
//            agents/conversations/messages/{id}.json   - 每个会话的消息
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

  // 删除会话及其消息
  async deleteConversation(id: string): Promise<void> {
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
}
