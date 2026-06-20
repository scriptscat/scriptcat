import { describe, it, expect, vi } from "vitest";
import { createAskUserTool } from "./ask_user";
import type { ChatStreamEvent } from "@App/app/service/agent/core/types";

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
    const [_askId, resolve] = Array.from(resolvers.entries())[0];
    resolve("Blue");

    const result = await resultPromise;
    expect(JSON.parse(result as string)).toEqual({ answer: "Blue" });
    expect(resolvers.size).toBe(0);
  });

  it("should throw if question is missing", async () => {
    const sendEvent = vi.fn();
    const resolvers = new Map<string, (answer: string) => void>();
    const { executor } = createAskUserTool(sendEvent, resolvers);

    await expect(executor.execute({})).rejects.toThrow('缺少必填参数 "question"');
  });

  it("should resolve with timeout reason after 5 minutes", async () => {
    vi.useFakeTimers();
    const sendEvent = vi.fn();
    const resolvers = new Map<string, (answer: string) => void>();

    const { executor } = createAskUserTool(sendEvent, resolvers);
    const resultPromise = executor.execute({ question: "Waiting..." });

    // Advance time past timeout
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    const result = JSON.parse((await resultPromise) as string);
    expect(result).toEqual({ answer: null, reason: "timeout" });
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
    for (const [_id, resolve] of resolvers) {
      resolve("answer");
    }
    await Promise.all([p1, p2]);
  });

  it("should send options in ask_user event", async () => {
    const events: ChatStreamEvent[] = [];
    const sendEvent = (event: ChatStreamEvent) => events.push(event);
    const resolvers = new Map<string, (answer: string) => void>();

    const { executor } = createAskUserTool(sendEvent, resolvers);

    const resultPromise = executor.execute({
      question: "Pick a color",
      options: ["Red", "Blue", "Green"],
    });

    expect(events).toHaveLength(1);
    const askEvent = events[0] as Extract<ChatStreamEvent, { type: "ask_user" }>;
    expect(askEvent.options).toEqual(["Red", "Blue", "Green"]);
    expect(askEvent.multiple).toBeUndefined();

    // Resolve
    const [_id, resolve] = Array.from(resolvers.entries())[0];
    resolve("Blue");
    const result = JSON.parse((await resultPromise) as string);
    expect(result).toEqual({ answer: "Blue" });
  });

  it("should send multiple flag in ask_user event", async () => {
    const events: ChatStreamEvent[] = [];
    const sendEvent = (event: ChatStreamEvent) => events.push(event);
    const resolvers = new Map<string, (answer: string) => void>();

    const { executor } = createAskUserTool(sendEvent, resolvers);

    const resultPromise = executor.execute({
      question: "Select languages",
      options: ["JavaScript", "Python", "Rust"],
      multiple: true,
    });

    expect(events).toHaveLength(1);
    const askEvent = events[0] as Extract<ChatStreamEvent, { type: "ask_user" }>;
    expect(askEvent.options).toEqual(["JavaScript", "Python", "Rust"]);
    expect(askEvent.multiple).toBe(true);

    // Resolve with multiple selections
    const [_id, resolve] = Array.from(resolvers.entries())[0];
    resolve(JSON.stringify(["JavaScript", "Rust"]));
    const result = JSON.parse((await resultPromise) as string);
    expect(result).toEqual({ answer: '["JavaScript","Rust"]' });
  });
});
