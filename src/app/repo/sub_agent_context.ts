import { OPFSRepo } from "@App/app/repo/opfs_repo";
import type { ChatRequest } from "@App/app/service/agent/core/types";

const MAX_CONTEXTS_PER_CONVERSATION = 10;

/** 子代理上下文条目（持久化格式） */
export interface SubAgentContextEntry {
  agentId: string;
  typeName: string;
  description: string;
  messages: ChatRequest["messages"];
  status: "completed" | "error";
  result?: string;
}

export class SubAgentContextRepo extends OPFSRepo {
  constructor() {
    super("subagent_contexts");
  }

  private filename(parentConversationId: string): string {
    return `${parentConversationId}.json`;
  }

  async getContexts(parentConversationId: string): Promise<SubAgentContextEntry[]> {
    return this.readJsonFile<SubAgentContextEntry[]>(this.filename(parentConversationId), []);
  }

  async getContext(parentConversationId: string, agentId: string): Promise<SubAgentContextEntry | undefined> {
    const entries = await this.getContexts(parentConversationId);
    return entries.find((e) => e.agentId === agentId);
  }

  async saveContext(parentConversationId: string, entry: SubAgentContextEntry): Promise<void> {
    const entries = await this.getContexts(parentConversationId);
    const idx = entries.findIndex((e) => e.agentId === entry.agentId);
    if (idx >= 0) {
      entries[idx] = entry;
    } else {
      // LRU：超过上限时淘汰最早的条目
      if (entries.length >= MAX_CONTEXTS_PER_CONVERSATION) {
        entries.shift();
      }
      entries.push(entry);
    }
    await this.writeJsonFile(this.filename(parentConversationId), entries);
  }

  async removeContexts(parentConversationId: string): Promise<void> {
    await this.deleteFile(this.filename(parentConversationId));
  }
}

// 模块单例
export const subAgentContextRepo = new SubAgentContextRepo();
