import type { Conversation, ChatMessage } from "@App/app/service/agent/types";

const AGENT_CHAT_DIR = "agent-chat";
const CONVERSATIONS_FILE = "conversations.json";
const MESSAGES_DIR = "messages";

// 获取 Agent 聊天的根目录
async function getAgentChatDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(AGENT_CHAT_DIR, { create: true });
}

// 获取消息目录
async function getMessagesDir(): Promise<FileSystemDirectoryHandle> {
  const chatDir = await getAgentChatDir();
  return chatDir.getDirectoryHandle(MESSAGES_DIR, { create: true });
}

// 读取 JSON 文件
async function readJsonFile<T>(dir: FileSystemDirectoryHandle, filename: string, defaultValue: T): Promise<T> {
  try {
    const fileHandle = await dir.getFileHandle(filename);
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text) as T;
  } catch {
    return defaultValue;
  }
}

// 写入 JSON 文件
async function writeJsonFile(dir: FileSystemDirectoryHandle, filename: string, data: unknown): Promise<void> {
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data));
  await writable.close();
}

export class AgentChatRepo {
  // 获取所有会话列表
  async listConversations(): Promise<Conversation[]> {
    const dir = await getAgentChatDir();
    return readJsonFile<Conversation[]>(dir, CONVERSATIONS_FILE, []);
  }

  // 保存/更新会话
  async saveConversation(conversation: Conversation): Promise<void> {
    const dir = await getAgentChatDir();
    const conversations = await readJsonFile<Conversation[]>(dir, CONVERSATIONS_FILE, []);
    const index = conversations.findIndex((c) => c.id === conversation.id);
    if (index >= 0) {
      conversations[index] = conversation;
    } else {
      conversations.unshift(conversation);
    }
    await writeJsonFile(dir, CONVERSATIONS_FILE, conversations);
  }

  // 删除会话及其消息
  async deleteConversation(id: string): Promise<void> {
    const dir = await getAgentChatDir();
    const conversations = await readJsonFile<Conversation[]>(dir, CONVERSATIONS_FILE, []);
    const filtered = conversations.filter((c) => c.id !== id);
    await writeJsonFile(dir, CONVERSATIONS_FILE, filtered);
    // 删除对应消息文件
    try {
      const messagesDir = await getMessagesDir();
      await messagesDir.removeEntry(`${id}.json`);
    } catch {
      // 消息文件不存在则忽略
    }
  }

  // 获取指定会话的所有消息
  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    const messagesDir = await getMessagesDir();
    return readJsonFile<ChatMessage[]>(messagesDir, `${conversationId}.json`, []);
  }

  // 追加消息
  async appendMessage(message: ChatMessage): Promise<void> {
    const messagesDir = await getMessagesDir();
    const messages = await readJsonFile<ChatMessage[]>(messagesDir, `${message.conversationId}.json`, []);
    messages.push(message);
    await writeJsonFile(messagesDir, `${message.conversationId}.json`, messages);
  }

  // 更新消息（按 id 匹配）
  async updateMessage(message: ChatMessage): Promise<void> {
    const messagesDir = await getMessagesDir();
    const messages = await readJsonFile<ChatMessage[]>(messagesDir, `${message.conversationId}.json`, []);
    const index = messages.findIndex((m) => m.id === message.id);
    if (index >= 0) {
      messages[index] = message;
      await writeJsonFile(messagesDir, `${message.conversationId}.json`, messages);
    }
  }

  // 保存整个消息列表（用于批量更新）
  async saveMessages(conversationId: string, messages: ChatMessage[]): Promise<void> {
    const messagesDir = await getMessagesDir();
    await writeJsonFile(messagesDir, `${conversationId}.json`, messages);
  }
}
