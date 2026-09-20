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
    const runtime = new ScriptRuntime("ct", server, {} as Message, {} as any);
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
    const runtime = new ScriptRuntime("ct", server, {} as Message, {} as any);
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
        scriptRevision: "inject-script-revision",
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
    const runtime = new ScriptRuntime("it", server, {} as Message, executor as unknown as ScriptExecutor);
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
    const runtime = new ScriptRuntime("it", server, {} as Message, executor as unknown as ScriptExecutor);
    runtime.init();

    const pageLoad = new Proxy(makePageLoad(), {
      ownKeys() {
        throw new Error("hostile enumeration");
      },
    });

    handlers.get("pageLoad")?.(pageLoad);

    expect(executor.startScripts).not.toHaveBeenCalled();
  });

  it("rejects pageLoad scripts without a current revision", () => {
    const { handlers, server } = makeServer();
    const executor = makeExecutor();
    const runtime = new ScriptRuntime("it", server, {} as Message, executor as unknown as ScriptExecutor);
    runtime.init();
    const pageLoad = makePageLoad();
    delete (pageLoad.scripts[0] as { scriptRevision?: string }).scriptRevision;

    handlers.get("pageLoad")?.(pageLoad);

    expect(executor.startScripts).not.toHaveBeenCalled();
  });

  it("accepts only unprivileged MAIN scripts without fallback bridge credentials", () => {
    const { handlers, server } = makeServer();
    const executor = makeExecutor();
    const runtime = new ScriptRuntime("it", server, {} as Message, executor as unknown as ScriptExecutor);
    runtime.init();

    const fallbackPageLoad = makePageLoad();
    const fallbackScript = fallbackPageLoad.scripts[0] as Record<string, any>;

    handlers.get("pageLoadFallback")?.(fallbackPageLoad);
    expect(executor.startScripts).not.toHaveBeenCalled();

    delete fallbackScript.executionHandle;
    delete fallbackScript.executionEnvTag;
    delete fallbackScript.executionRunFlag;
    fallbackScript.metadata.grant = ["none"];
    fallbackScript.value = {};
    fallbackScript.resource = {};
    fallbackScript.userConfigStr = "";

    handlers.get("pageLoadFallback")?.(fallbackPageLoad);
    expect(executor.startScripts).toHaveBeenCalledWith(fallbackPageLoad.scripts, fallbackPageLoad.envInfo, {
      reconcileEarlyScripts: false,
    });
    (executor.startScripts as ReturnType<typeof vi.fn>).mockClear();

    fallbackScript.metadata.grant = ["GM_getValue"];
    handlers.get("pageLoadFallback")?.(fallbackPageLoad);
    expect(executor.startScripts).not.toHaveBeenCalled();
  });

  it("rejects callback DTO accessors before entering the script context", () => {
    const { handlers, server } = makeServer();
    const executor = makeExecutor();
    const runtime = new ScriptRuntime("it", server, {} as Message, executor as unknown as ScriptExecutor);
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
    const runtime = new ScriptRuntime("it", server, {} as Message, executor as unknown as ScriptExecutor);
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
    const runtime = new ScriptRuntime("it", server, {} as Message, executor as unknown as ScriptExecutor);
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
    const runtime = new ScriptRuntime("it", server, {} as Message, executor as unknown as ScriptExecutor);
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
    const runtime = new ScriptRuntime("it", server, {} as Message, executor as unknown as ScriptExecutor);
    runtime.init();

    const pageLoad = makePageLoad();
    Object.defineProperty(pageLoad.scripts[0], "executionHandle", { configurable: true, value: undefined });

    handlers.get("pageLoad")?.(pageLoad);

    expect(executor.startScripts).not.toHaveBeenCalled();
  });

  it("starts scripts only after validating and cloning the execution binding", () => {
    const { handlers, server } = makeServer();
    const executor = makeExecutor();
    const runtime = new ScriptRuntime("it", server, {} as Message, executor as unknown as ScriptExecutor);
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

  it("rejects empty inject pageLoads from the page-visible runtime server", () => {
    const { handlers, server } = makeServer();
    const executor = makeExecutor();
    const runtime = new ScriptRuntime("it", server, {} as Message, executor as unknown as ScriptExecutor);
    runtime.init();
    const pageLoad = {
      scripts: [],
      envInfo: { userAgentData: {}, sandboxMode: "raw", isIncognito: false },
    };

    handlers.get("pageLoad")?.(pageLoad);
    expect(executor.startScripts).not.toHaveBeenCalled();

    handlers.get("pageLoad")?.({ ...pageLoad, purpose: "reconcile" });
    handlers.get("pageLoadFallback")?.(pageLoad);
    handlers.get("pageLoadFallback")?.({ ...pageLoad, purpose: "reconcile" });

    expect(executor.startScripts).not.toHaveBeenCalled();
  });

  it("accepts empty inject reconciliation from the authenticated native pageLoad handler", () => {
    const { server } = makeServer();
    const executor = makeExecutor();
    const runtime = new ScriptRuntime("it", server, {} as Message, executor as unknown as ScriptExecutor);
    runtime.init();
    const pageLoad = {
      scripts: [],
      envInfo: { userAgentData: {}, sandboxMode: "raw", isIncognito: false },
      purpose: "reconcile" as const,
    };

    runtime.receiveNativePageLoad(pageLoad);

    expect(executor.startScripts).toHaveBeenCalledOnce();
    expect(executor.startScripts).toHaveBeenCalledWith(pageLoad.scripts, pageLoad.envInfo);
  });

  it("rejects a reconciliation marker that carries executable scripts", () => {
    const { handlers, server } = makeServer();
    const executor = makeExecutor();
    const runtime = new ScriptRuntime("it", server, {} as Message, executor as unknown as ScriptExecutor);
    runtime.init();

    handlers.get("pageLoad")?.({ ...makePageLoad(), purpose: "reconcile" });

    expect(executor.startScripts).not.toHaveBeenCalled();
  });

  it("rejects native reconciliation metadata from the page-visible fallback", () => {
    const { handlers, server } = makeServer();
    const executor = makeExecutor();
    const runtime = new ScriptRuntime("it", server, {} as Message, executor as unknown as ScriptExecutor);
    runtime.init();

    handlers.get("pageLoadFallback")?.({
      scripts: [],
      envInfo: { userAgentData: {}, sandboxMode: "raw", isIncognito: false },
      purpose: "reconcile",
    });

    expect(executor.startScripts).not.toHaveBeenCalled();
  });

  it("does not execute the same native bootstrap twice after a USER_SCRIPT reconnect", () => {
    const { handlers, server } = makeServer();
    const executor = makeExecutor();
    const runtime = new ScriptRuntime("it", server, {} as Message, executor as unknown as ScriptExecutor);
    runtime.init();

    const first = makePageLoad();
    const replay = makePageLoad();
    handlers.get("pageLoad")?.(first);
    handlers.get("pageLoad")?.(replay);

    expect(executor.startScripts).toHaveBeenCalledOnce();
  });

  it("forwards the native bootstrap after starting page-visible fallback scripts", () => {
    const { handlers, server } = makeServer();
    const executor = makeExecutor();
    const runtime = new ScriptRuntime("it", server, {} as Message, executor as unknown as ScriptExecutor);
    runtime.init();

    const fallbackPageLoad = makePageLoad();
    const fallbackScript = fallbackPageLoad.scripts[0] as Record<string, any>;
    delete fallbackScript.executionHandle;
    delete fallbackScript.executionEnvTag;
    delete fallbackScript.executionRunFlag;
    fallbackScript.metadata.grant = ["none"];
    fallbackScript.userConfigStr = "";
    handlers.get("pageLoadFallback")?.(fallbackPageLoad);

    const nativePageLoad = makePageLoad();
    handlers.get("pageLoad")?.(nativePageLoad);

    expect(executor.startScripts).toHaveBeenCalledTimes(2);
    expect(executor.startScripts).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining([expect.objectContaining({ uuid: "inject-script" })]),
      fallbackPageLoad.envInfo,
      { reconcileEarlyScripts: false }
    );
    expect(executor.startScripts).toHaveBeenNthCalledWith(2, nativePageLoad.scripts, nativePageLoad.envInfo);
  });

  it("keeps the content pageLoad path on the native payload", () => {
    const { handlers, server } = makeServer();
    const executor = makeExecutor();
    const runtime = new ScriptRuntime("ct", server, {} as Message, executor as unknown as ScriptExecutor);
    runtime.init();

    const pageLoad = { scripts: [], envInfo: { userAgentData: {}, sandboxMode: "raw", isIncognito: false } };
    handlers.get("pageLoad")?.(pageLoad);

    expect(executor.startScripts).toHaveBeenCalledWith(pageLoad.scripts, pageLoad.envInfo);
  });

  it("rejects content pageLoad accessors before starting scripts", () => {
    const { handlers, server } = makeServer();
    const executor = makeExecutor();
    const runtime = new ScriptRuntime("ct", server, {} as Message, executor as unknown as ScriptExecutor);
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
    const runtime = new ScriptRuntime("ct", server, {} as Message, executor as unknown as ScriptExecutor);
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
