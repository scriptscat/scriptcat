import { describe, expect, it, vi } from "vitest";
import { BackgroundSessionManager, type RunningConversation } from "./background_session_manager";

function createSender() {
  const sentMessages: any[] = [];
  const connection = {
    sendMessage: (message: any) => sentMessages.push(message),
    onMessage: vi.fn(),
    onDisconnect: vi.fn(),
  };
  return {
    sender: {
      isType: (type: any) => type === 1,
      getConnect: () => connection,
    } as any,
    sentMessages,
  };
}

describe("BackgroundSessionManager script ownership", () => {
  it("does not attach a script to another script's running conversation", async () => {
    const manager = new BackgroundSessionManager();
    const rc: RunningConversation = {
      conversationId: "conv-owned",
      generation: "gen-a",
      ownerScriptUuid: "script-a",
      abortController: new AbortController(),
      listeners: new Set(),
      streamingState: { content: "secret", thinking: "", toolCalls: [] },
      askResolvers: new Map(),
      tasks: [],
      status: "running" as const,
    };
    manager.set(rc.conversationId, rc);
    const { sender, sentMessages } = createSender();

    await manager.handleAttach(
      { conversationId: rc.conversationId, generation: rc.generation, scriptUuid: "script-b" },
      sender
    );

    expect(sentMessages).toContainEqual({ action: "event", data: { type: "sync", tasks: [], status: "done" } });
    expect(rc.listeners.size).toBe(0);
  });
});
