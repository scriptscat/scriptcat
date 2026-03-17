import { describe, it, expect, vi } from "vitest";
import { createAskUserTool } from "./ask_user";
import type { ChatStreamEvent } from "@App/app/service/agent/types";

describe("ask_user", () => {
  it("should send ask_user event and resolve when answer is provided", async () => {
    const events: ChatStreamEvent[] = [];
    const sendEvent = (event: ChatStreamEvent) => events.push(event);
    const resolvers = new Map<string, (answer: string) => void>();

    const { executor } = createAskUserTool(sendEvent, resolvers);

    // Start execution (will block until resolved)
    const resultPromise = executor.execute({ question: "What color?" });

    // Verify event was sent
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("ask_user");
    const askEvent = events[0] as Extract<ChatStreamEvent, { type: "ask_user" }>;
    expect(askEvent.question).toBe("What color?");

    // Resolve the question
    expect(resolvers.size).toBe(1);
    const [askId, resolve] = Array.from(resolvers.entries())[0];
    resolve("Blue");

    const result = await resultPromise;
    expect(JSON.parse(result as string)).toEqual({ answer: "Blue" });
    expect(resolvers.size).toBe(0);
  });

  it("should throw if question is missing", async () => {
    const sendEvent = vi.fn();
    const resolvers = new Map<string, (answer: string) => void>();
    const { executor } = createAskUserTool(sendEvent, resolvers);

    await expect(executor.execute({})).rejects.toThrow("question is required");
  });

  it("should timeout after 5 minutes", async () => {
    vi.useFakeTimers();
    const sendEvent = vi.fn();
    const resolvers = new Map<string, (answer: string) => void>();

    const { executor } = createAskUserTool(sendEvent, resolvers);
    const resultPromise = executor.execute({ question: "Waiting..." });

    // Advance time past timeout
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    await expect(resultPromise).rejects.toThrow("User did not respond within 5 minutes");
    expect(resolvers.size).toBe(0);

    vi.useRealTimers();
  });

  it("should generate unique ask IDs", async () => {
    const events: ChatStreamEvent[] = [];
    const sendEvent = (event: ChatStreamEvent) => events.push(event);
    const resolvers = new Map<string, (answer: string) => void>();

    const { executor } = createAskUserTool(sendEvent, resolvers);

    // Start two asks
    const p1 = executor.execute({ question: "Q1" });
    const p2 = executor.execute({ question: "Q2" });

    expect(events).toHaveLength(2);
    const id1 = (events[0] as Extract<ChatStreamEvent, { type: "ask_user" }>).id;
    const id2 = (events[1] as Extract<ChatStreamEvent, { type: "ask_user" }>).id;
    expect(id1).not.toBe(id2);

    // Resolve both
    for (const [id, resolve] of resolvers) {
      resolve("answer");
    }
    await Promise.all([p1, p2]);
  });
});
