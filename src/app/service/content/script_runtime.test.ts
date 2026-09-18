import { describe, expect, it, vi } from "vitest";
import type { Message } from "@Packages/message/types";
import type { Server } from "@Packages/message/server";
import type { CustomEventMessage } from "@Packages/message/custom_event_message";
import { ScriptRuntime } from "./script_runtime";

describe("ScriptRuntime DOM bridge", () => {
  it("rejects accessor attributes without executing their getters", () => {
    let handler: ((data: any) => unknown) | undefined;
    const server = {
      on: vi.fn((_name: string, callback: (data: any) => unknown) => {
        handler = callback;
      }),
    } as unknown as Server;
    const runtime = new ScriptRuntime("ct", server, {} as Message, {} as any, undefined);
    runtime.contentInit(server, {} as CustomEventMessage);

    const getter = vi.fn(() => "secret");
    const attrs = {} as Record<string, unknown>;
    Object.defineProperty(attrs, "id", { configurable: true, enumerable: true, get: getter });

    expect(handler?.({ params: [null, "div", attrs] })).toBeUndefined();
    expect(getter).not.toHaveBeenCalled();
  });

  it("creates an element only from the cloned flat attribute payload", () => {
    let handler: ((data: any) => unknown) | undefined;
    const domMessage = {
      getAndDelRelatedTarget: vi.fn(),
      sendRelatedTarget: vi.fn(() => 1),
    } as unknown as CustomEventMessage;
    const server = {
      on: vi.fn((_name: string, callback: (data: any) => unknown) => {
        handler = callback;
      }),
    } as unknown as Server;
    const runtime = new ScriptRuntime("ct", server, {} as Message, {} as any, undefined);
    runtime.contentInit(server, domMessage);

    const result = handler?.({ params: [null, "div", { id: "safe", textContent: "hello" }] });

    expect(result).toBe(1);
    expect(domMessage.sendRelatedTarget).toHaveBeenCalledWith(expect.any(HTMLDivElement));
    const element = (domMessage.sendRelatedTarget as any).mock.calls[0][0] as HTMLDivElement;
    expect(element.id).toBe("safe");
    expect(element.textContent).toBe("hello");
  });
});
