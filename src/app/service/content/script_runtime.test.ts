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

  it("keeps the content pageLoad path on the native payload", () => {
    const { handlers, server } = makeServer();
    const executor = makeExecutor();
    const runtime = new ScriptRuntime("ct", server, {} as Message, executor as unknown as ScriptExecutor, undefined);
    runtime.init();

    const pageLoad = { scripts: [], envInfo: { userAgentData: {}, sandboxMode: "raw", isIncognito: false } };
    handlers.get("pageLoad")?.(pageLoad);

    expect(executor.startScripts).toHaveBeenCalledWith(pageLoad.scripts, pageLoad.envInfo);
  });
});
