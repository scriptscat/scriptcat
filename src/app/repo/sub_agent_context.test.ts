import { describe, expect, it, beforeEach } from "vitest";
import { SubAgentContextRepo, type SubAgentContextEntry } from "./sub_agent_context";
import { createMockOPFS } from "./test-helpers";

function makeEntry(overrides: Partial<SubAgentContextEntry> = {}): SubAgentContextEntry {
  return {
    agentId: "agent-1",
    typeName: "researcher",
    description: "test agent",
    messages: [
      { role: "system", content: "You are a researcher." },
      { role: "user", content: "Hello" },
    ],
    status: "completed",
    result: "Done",
    ...overrides,
  };
}

describe("SubAgentContextRepo", () => {
  let repo: SubAgentContextRepo;

  beforeEach(() => {
    createMockOPFS();
    repo = new SubAgentContextRepo();
  });

  it("空对话返回空数组", async () => {
    const contexts = await repo.getContexts("conv-1");
    expect(contexts).toEqual([]);
  });

  it("保存并读取单个上下文", async () => {
    const entry = makeEntry();
    await repo.saveContext("conv-1", entry);

    const result = await repo.getContext("conv-1", "agent-1");
    expect(result).toBeDefined();
    expect(result!.agentId).toBe("agent-1");
    expect(result!.typeName).toBe("researcher");
    expect(result!.messages).toHaveLength(2);
  });

  it("更新已有上下文", async () => {
    await repo.saveContext("conv-1", makeEntry());
    await repo.saveContext("conv-1", makeEntry({ result: "Updated" }));

    const contexts = await repo.getContexts("conv-1");
    expect(contexts).toHaveLength(1);
    expect(contexts[0].result).toBe("Updated");
  });

  it("同一对话保存多个子代理", async () => {
    await repo.saveContext("conv-1", makeEntry({ agentId: "agent-1" }));
    await repo.saveContext("conv-1", makeEntry({ agentId: "agent-2", typeName: "page_operator" }));

    const contexts = await repo.getContexts("conv-1");
    expect(contexts).toHaveLength(2);
    expect(contexts[0].agentId).toBe("agent-1");
    expect(contexts[1].agentId).toBe("agent-2");
  });

  it("不同对话互相隔离", async () => {
    await repo.saveContext("conv-1", makeEntry({ agentId: "a1" }));
    await repo.saveContext("conv-2", makeEntry({ agentId: "a2" }));

    expect(await repo.getContext("conv-1", "a1")).toBeDefined();
    expect(await repo.getContext("conv-1", "a2")).toBeUndefined();
    expect(await repo.getContext("conv-2", "a2")).toBeDefined();
  });

  it("LRU 淘汰：超过 10 个时移除最早的", async () => {
    for (let i = 0; i < 11; i++) {
      await repo.saveContext("conv-1", makeEntry({ agentId: `agent-${i}` }));
    }

    const contexts = await repo.getContexts("conv-1");
    expect(contexts).toHaveLength(10);
    // 第 0 个被淘汰
    expect(contexts[0].agentId).toBe("agent-1");
    expect(contexts[9].agentId).toBe("agent-10");
  });

  it("getContext 返回 undefined 当 agentId 不存在", async () => {
    await repo.saveContext("conv-1", makeEntry());
    const result = await repo.getContext("conv-1", "nonexistent");
    expect(result).toBeUndefined();
  });

  it("removeContexts 清除整个对话的上下文", async () => {
    await repo.saveContext("conv-1", makeEntry({ agentId: "a1" }));
    await repo.saveContext("conv-1", makeEntry({ agentId: "a2" }));

    await repo.removeContexts("conv-1");
    const contexts = await repo.getContexts("conv-1");
    expect(contexts).toEqual([]);
  });

  it("removeContexts 不影响其他对话", async () => {
    await repo.saveContext("conv-1", makeEntry({ agentId: "a1" }));
    await repo.saveContext("conv-2", makeEntry({ agentId: "a2" }));

    await repo.removeContexts("conv-1");
    expect(await repo.getContext("conv-2", "a2")).toBeDefined();
  });
});
