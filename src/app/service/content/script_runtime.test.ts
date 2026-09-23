import { describe, expect, it, vi } from "vitest";
import type { Message } from "@Packages/message/types";
import type { Server } from "@Packages/message/server";
import type { CustomEventMessage } from "@Packages/message/custom_event_message";
import { ScriptRuntime } from "./script_runtime";
import type { ScriptExecutor } from "./script_executor";

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

describe("ScriptRuntime inject page bootstrap", () => {
  const makeServer = () => {
    const handlers = new Map<string, (data: unknown) => unknown>();
    const server = {
      on: vi.fn((name: string, callback: (data: unknown) => unknown) => {
        handlers.set(name, callback);
      }),
    } as unknown as Server;
    return { handlers, server };
  };

  const makeExecutor = () => ({
    checkEarlyStartScript: vi.fn(),
    startScripts: vi.fn(),
    emitEvent: vi.fn(),
    valueUpdate: vi.fn(),
  });

  const makePageLoad = () => ({
    scripts: [
      {
        uuid: "inject-script",
        scriptRevision: "inject-script:1:0",
        name: "Inject script",
        flag: "inject-script-flag",
        code: "",
        metadata: { grant: [] },
        resource: {},
        value: {},
        executionHandle: "page-binding",
        executionEnvTag: "it",
        executionRunFlag: "page-run",
      },
    ],
    envInfo: { userAgentData: {}, sandboxMode: "raw", isIncognito: false },
  });

  it("rejects pageLoad payloads with accessors before starting scripts", () => {
    const { handlers, server } = makeServer();
    const executor = makeExecutor();
    const runtime = new ScriptRuntime("it", server, {} as Message, executor as unknown as ScriptExecutor, undefined);
    runtime.init();

    const pageLoad = makePageLoad();
    const scripts = pageLoad.scripts;
    const getter = vi.fn(() => scripts);
    Object.defineProperty(pageLoad, "scripts", { configurable: true, enumerable: true, get: getter });

    handlers.get("pageLoad")?.(pageLoad);

    expect(getter).not.toHaveBeenCalled();
    expect(executor.startScripts).not.toHaveBeenCalled();
  });

  it("rejects pageLoad scripts without a source revision", () => {
    const { handlers, server } = makeServer();
    const executor = makeExecutor();
    const runtime = new ScriptRuntime("it", server, {} as Message, executor as unknown as ScriptExecutor, undefined);
    runtime.init();

    const pageLoad = makePageLoad();
    delete (pageLoad.scripts[0] as { scriptRevision?: string }).scriptRevision;

    handlers.get("pageLoad")?.(pageLoad);

    expect(executor.startScripts).not.toHaveBeenCalled();
  });

  it("rejects pageLoad payloads whose own-key enumeration throws", () => {
    const { handlers, server } = makeServer();
    const executor = makeExecutor();
    const runtime = new ScriptRuntime("it", server, {} as Message, executor as unknown as ScriptExecutor, undefined);
    runtime.init();

    const pageLoad = new Proxy(makePageLoad(), {
      ownKeys() {
        throw new Error("hostile enumeration");
      },
    });

    handlers.get("pageLoad")?.(pageLoad);

    expect(executor.startScripts).not.toHaveBeenCalled();
  });

  it("rejects callback DTO accessors before entering the script context", () => {
    const { handlers, server } = makeServer();
    const executor = makeExecutor();
    const runtime = new ScriptRuntime("it", server, {} as Message, executor as unknown as ScriptExecutor, undefined);
    runtime.init();

    const eventData = { uuid: "script", event: "menuClick", eventId: "1", data: { value: 1 } };
    const getter = vi.fn(() => eventData.data);
    Object.defineProperty(eventData, "data", { configurable: true, enumerable: true, get: getter });

    handlers.get("runtime/emitEvent")?.(eventData);

    expect(getter).not.toHaveBeenCalled();
    expect(executor.emitEvent).not.toHaveBeenCalled();
  });

  it("rejects accessors nested in collection callback payloads", () => {
    const { handlers, server } = makeServer();
    const executor = makeExecutor();
    const runtime = new ScriptRuntime("it", server, {} as Message, executor as unknown as ScriptExecutor, undefined);
    runtime.init();

    const getter = vi.fn(() => "secret");
    const nested = {} as Record<string, unknown>;
    Object.defineProperty(nested, "value", { configurable: true, enumerable: true, get: getter });
    const eventData = {
      uuid: "script",
      event: "menuClick",
      eventId: "1",
      data: new Map([["nested", nested]]),
    };

    handlers.get("runtime/emitEvent")?.(eventData);

    expect(getter).not.toHaveBeenCalled();
    expect(executor.emitEvent).not.toHaveBeenCalled();
  });

  it("rejects accessors nested in set callback payloads", () => {
    const { handlers, server } = makeServer();
    const executor = makeExecutor();
    const runtime = new ScriptRuntime("it", server, {} as Message, executor as unknown as ScriptExecutor, undefined);
    runtime.init();

    const getter = vi.fn(() => "secret");
    const nested = {} as Record<string, unknown>;
    Object.defineProperty(nested, "value", { configurable: true, enumerable: true, get: getter });
    const eventData = {
      uuid: "script",
      event: "menuClick",
      eventId: "1",
      data: new Set([nested]),
    };

    handlers.get("runtime/emitEvent")?.(eventData);

    expect(getter).not.toHaveBeenCalled();
    expect(executor.emitEvent).not.toHaveBeenCalled();
  });

  it("clones valid callback and value-update DTOs before dispatch", () => {
    const { handlers, server } = makeServer();
    const executor = makeExecutor();
    const runtime = new ScriptRuntime("it", server, {} as Message, executor as unknown as ScriptExecutor, undefined);
    runtime.init();

    const eventData = { uuid: "script", event: "menuClick", eventId: "1", data: { value: 1 } };
    const valueData = {
      uuid: "script",
      storageName: "script",
      entries: [["key", [0, { value: 1 }], [2]]],
      sender: { runFlag: "run", tabId: 3 },
      valueUpdated: true,
    };

    handlers.get("runtime/emitEvent")?.(eventData);
    handlers.get("runtime/valueUpdate")?.(valueData);

    expect(executor.emitEvent).toHaveBeenCalledOnce();
    expect(executor.valueUpdate).toHaveBeenCalledOnce();
    expect(executor.emitEvent.mock.calls[0][0]).not.toBe(eventData);
    expect(executor.valueUpdate.mock.calls[0][0]).not.toBe(valueData);
    expect(executor.emitEvent.mock.calls[0][0]).toEqual(eventData);
    expect(executor.valueUpdate.mock.calls[0][0]).toEqual(valueData);
  });

  it("rejects inject scripts without the current execution binding", () => {
    const { handlers, server } = makeServer();
    const executor = makeExecutor();
    const runtime = new ScriptRuntime("it", server, {} as Message, executor as unknown as ScriptExecutor, undefined);
    runtime.init();

    const pageLoad = makePageLoad();
    Object.defineProperty(pageLoad.scripts[0], "executionHandle", { configurable: true, value: undefined });

    handlers.get("pageLoad")?.(pageLoad);

    expect(executor.startScripts).not.toHaveBeenCalled();
  });

  it("starts scripts only after validating and cloning the execution binding", () => {
    const { handlers, server } = makeServer();
    const executor = makeExecutor();
    const runtime = new ScriptRuntime("it", server, {} as Message, executor as unknown as ScriptExecutor, undefined);
    runtime.init();

    const pageLoad = makePageLoad();
    handlers.get("pageLoad")?.(pageLoad);

    expect(executor.startScripts).toHaveBeenCalledOnce();
    const [scripts, envInfo] = executor.startScripts.mock.calls[0];
    expect(scripts).not.toBe(pageLoad.scripts);
    expect(scripts[0]).toMatchObject({
      executionHandle: "page-binding",
      executionEnvTag: "it",
      executionRunFlag: "page-run",
    });
    expect(envInfo).toEqual(pageLoad.envInfo);
  });

  it("does not execute the same native bootstrap twice after a USER_SCRIPT reconnect", () => {
    const { handlers, server } = makeServer();
    const executor = makeExecutor();
    const runtime = new ScriptRuntime("it", server, {} as Message, executor as unknown as ScriptExecutor, undefined);
    runtime.init();

    const first = makePageLoad();
    const replay = makePageLoad();
    handlers.get("pageLoad")?.(first);
    handlers.get("pageLoad")?.(replay);

    expect(executor.startScripts).toHaveBeenCalledOnce();
  });

  it("keeps the content pageLoad path on the native payload", () => {
    const { handlers, server } = makeServer();
    const executor = makeExecutor();
    const runtime = new ScriptRuntime("ct", server, {} as Message, executor as unknown as ScriptExecutor, undefined);
    runtime.init();

    const pageLoad = { scripts: [], envInfo: { userAgentData: {}, sandboxMode: "raw", isIncognito: false } };
    handlers.get("pageLoad")?.(pageLoad);

    expect(executor.startScripts).toHaveBeenCalledWith(pageLoad.scripts, pageLoad.envInfo);
  });

  it("rejects content pageLoad accessors before starting scripts", () => {
    const { handlers, server } = makeServer();
    const executor = makeExecutor();
    const runtime = new ScriptRuntime("ct", server, {} as Message, executor as unknown as ScriptExecutor, undefined);
    runtime.init();

    const pageLoad = {
      scripts: [
        {
          uuid: "content-script",
          name: "Content script",
          flag: "content-script-flag",
          code: "",
          metadata: { grant: [] },
          resource: {},
          value: {},
          executionHandle: "content-binding",
          executionEnvTag: "ct",
          executionRunFlag: "content-run",
        },
      ],
      envInfo: { userAgentData: {}, sandboxMode: "raw", isIncognito: false },
    };
    const scripts = pageLoad.scripts;
    const getter = vi.fn(() => scripts);
    Object.defineProperty(pageLoad, "scripts", { configurable: true, enumerable: true, get: getter });

    handlers.get("pageLoad")?.(pageLoad);

    expect(getter).not.toHaveBeenCalled();
    expect(executor.startScripts).not.toHaveBeenCalled();
  });

  it("rejects content callback DTO accessors before dispatch", () => {
    const { handlers, server } = makeServer();
    const executor = makeExecutor();
    const runtime = new ScriptRuntime("ct", server, {} as Message, executor as unknown as ScriptExecutor, undefined);
    runtime.init();

    const eventData = { uuid: "script", event: "menuClick", eventId: "1", data: { value: 1 } };
    const eventPayload = eventData.data;
    const getter = vi.fn(() => eventPayload);
    Object.defineProperty(eventData, "data", { configurable: true, enumerable: true, get: getter });

    handlers.get("runtime/emitEvent")?.(eventData);

    expect(getter).not.toHaveBeenCalled();
    expect(executor.emitEvent).not.toHaveBeenCalled();
  });
});

describe("ScriptRuntime fallback batches", () => {
  const batch = (id: number) => ({
    id,
    valueUpdates: [
      {
        uuid: "script",
        storageName: "script",
        entries: [["key", [0, { value: 1 }], [2]]],
        sender: { runFlag: "run" },
        valueUpdated: true,
      },
    ],
    emitEvents: [{ uuid: "script", event: "menuClick", eventId: `${id}` }],
  });

  it("applies contiguous batches once and treats duplicates as already applied", () => {
    const server = { on: vi.fn() } as unknown as Server;
    const executor = {
      checkEarlyStartScript: vi.fn(),
      startScripts: vi.fn(),
      emitEvent: vi.fn(),
      valueUpdate: vi.fn(),
    };
    const runtime = new ScriptRuntime("it", server, {} as Message, executor as unknown as ScriptExecutor, undefined);
    const first = runtime.receiveFallbackBatch(batch(1));
    const duplicate = runtime.receiveFallbackBatch(batch(1));

    expect(first).toEqual({ applied: true, batchId: 1 });
    expect(duplicate).toEqual({ applied: true, batchId: 1, duplicate: true });
    expect(executor.valueUpdate).toHaveBeenCalledOnce();
    expect(executor.emitEvent).toHaveBeenCalledOnce();
  });

  it("rejects gaps and malformed DTOs without acknowledging them", () => {
    const server = { on: vi.fn() } as unknown as Server;
    const executor = {
      checkEarlyStartScript: vi.fn(),
      startScripts: vi.fn(),
      emitEvent: vi.fn(),
      valueUpdate: vi.fn(),
    };
    const runtime = new ScriptRuntime("it", server, {} as Message, executor as unknown as ScriptExecutor, undefined);

    expect(runtime.receiveFallbackBatch(batch(2))).toEqual({ applied: false, expectedBatchId: 1 });
    const malformed = batch(1);
    malformed.valueUpdates[0].entries[0][1] = [9] as never;
    expect(runtime.receiveFallbackBatch(malformed)).toBeUndefined();
    expect(runtime.receiveFallbackBatch(batch(1))).toEqual({ applied: true, batchId: 1 });
  });

  it("contains callback failures after consuming a valid batch", () => {
    const server = { on: vi.fn() } as unknown as Server;
    const executor = {
      checkEarlyStartScript: vi.fn(),
      startScripts: vi.fn(),
      emitEvent: vi.fn(() => {
        throw new Error("callback failed");
      }),
      valueUpdate: vi.fn(() => {
        throw new Error("callback failed");
      }),
    };
    const runtime = new ScriptRuntime("it", server, {} as Message, executor as unknown as ScriptExecutor, undefined);

    expect(() => runtime.receiveFallbackBatch(batch(1))).not.toThrow();
  });
});
