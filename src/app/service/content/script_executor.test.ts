import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { Message } from "@Packages/message/types";
import type { ScriptLoadInfo } from "../service_worker/types";
import type { TScriptInfo } from "@App/app/repo/scripts";
import type { GMInfoEnv } from "./types";
import { initEnvInfo, ScriptExecutor } from "./script_executor";
import { compileInjectScript, compilePreInjectScript } from "./utils";
import { DefinedFlags } from "../service_worker/runtime.consts";
import { pageDispatchEvent } from "@Packages/message/common";

const styleUrl = "https://example.com/style.css";
const secondStyleUrl = "https://example.com/second-style.css";
const fnStrIntegrity = process.env.SC_RANDOM_FNKEY!;

function makeScript(overrides: Partial<ScriptLoadInfo & Pick<TScriptInfo, "requireCssResource">> = {}): ScriptLoadInfo {
  return {
    uuid: "executor-test-uuid",
    name: "Executor test",
    namespace: "executor.test",
    type: 1,
    status: 1,
    sort: 0,
    runStatus: "complete",
    createtime: Date.now(),
    checktime: Date.now(),
    code: "",
    value: {},
    flag: "executor-test-flag",
    resource: {},
    metadata: {},
    originalMetadata: {},
    metadataStr: "",
    userConfigStr: "",
    ...overrides,
  };
}

function mountInjectScript(script: ScriptLoadInfo, code: string) {
  const execute = new Function("window", compileInjectScript(script, code)) as (target: Window) => void;
  execute(window);
}

function mountPreInjectScript(script: ScriptLoadInfo) {
  const performance = { dispatchEvent: vi.fn(() => false), addEventListener: vi.fn() };
  const execute = new Function("window", "performance", "CustomEvent", compilePreInjectScript(script, "")) as (
    target: Window,
    perf: typeof performance,
    customEvent: typeof CustomEvent
  ) => void;
  execute(window, performance, CustomEvent);
  return performance;
}

function attachLegacyPreInjectMetadata(scriptFunc: (...args: unknown[]) => unknown, scriptInfo: TScriptInfo) {
  const documentId = "script-executor-test-document";
  const documentIdKey = `${fnStrIntegrity}:documentId`;
  if (!Object.prototype.hasOwnProperty.call(window, documentIdKey)) {
    Object.defineProperty(window, documentIdKey, { configurable: false, writable: false, value: documentId });
  }
  Object.defineProperty(scriptFunc, fnStrIntegrity, { value: true });
  Object.defineProperty(scriptFunc, `${fnStrIntegrity}:scriptInfo`, { value: JSON.stringify(scriptInfo) });
  Object.defineProperty(scriptFunc, `${fnStrIntegrity}:documentUrl`, { value: window.location.href });
  Object.defineProperty(scriptFunc, documentIdKey, { value: documentId });
}

describe("ScriptExecutor", () => {
  it("uses the configured transport prefix for USER_SCRIPT GM calls", () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const script = makeScript({ metadata: { grant: ["GM_log"] } });
    const executor = new ScriptExecutor({ sendMessage } as unknown as Message, {} as Message, "serviceWorker");

    executor.execScriptEntry({
      scriptLoadInfo: script,
      scriptFlag: script.flag,
      envInfo: initEnvInfo,
      scriptFunc: (_token: string, context: any) => context.GM_log("transport prefix"),
    });

    expect(sendMessage).toHaveBeenCalledWith({
      action: "serviceWorker/runtime/gmApi",
      data: expect.objectContaining({ api: "GM_log" }),
    });
  });

  it("does not resolve page-patchable Map methods for execution bookkeeping", () => {
    const originalSet = Map.prototype.set;
    const originalGet = Map.prototype.get;
    const originalValues = Map.prototype.values;
    const receivers: Map<unknown, unknown>[] = [];
    Map.prototype.set = function (key, value) {
      receivers.push(this);
      return originalSet.call(this, key, value);
    };
    Map.prototype.get = function (key) {
      receivers.push(this);
      return originalGet.call(this, key);
    };
    Map.prototype.values = function () {
      receivers.push(this);
      return originalValues.call(this);
    };
    try {
      const executor = new ScriptExecutor({} as Message, {} as Message);
      executor.execScriptEntry({
        scriptLoadInfo: makeScript(),
        scriptFlag: "executor-test-flag",
        envInfo: initEnvInfo,
        scriptFunc: () => undefined,
      });
      expect(receivers).toHaveLength(0);
    } finally {
      Map.prototype.set = originalSet;
      Map.prototype.get = originalGet;
      Map.prototype.values = originalValues;
    }
  });

  it("attaches the page execution binding when an early-start script is reconciled", () => {
    const initial = {
      ...makeScript({ metadata: { "early-start": [""], "run-at": ["document-start"] } }),
      scriptRevision: "executor-test-uuid:1:0",
    } as TScriptInfo;
    const executor = new ScriptExecutor({} as Message, {} as Message);

    executor.execScriptEntry({
      scriptLoadInfo: initial,
      scriptFlag: initial.flag,
      envInfo: initEnvInfo,
      scriptFunc: () => undefined,
    });

    const exec = (
      executor as unknown as {
        execScripts: Map<
          string,
          {
            scriptRes: TScriptInfo;
            reconcileEarlyScript: (envInfo: GMInfoEnv, scriptInfo?: TScriptInfo) => boolean;
            execContext: any;
          }
        >;
      }
    ).execScripts.get(initial.uuid)!;
    expect(exec.scriptRes.executionHandle).toBeUndefined();
    const gmInfo = exec.execContext.GM_info;

    expect(
      exec.reconcileEarlyScript(initEnvInfo, {
        ...initial,
        value: { secret: "authoritative-value" },
        config: {
          private: { secret: { title: "Private", description: "", index: 0, default: "authoritative" } },
        },
        userConfig: {
          account: { profile: { title: "Profile", description: "", index: 0, default: "authoritative" } },
        },
        userConfigStr: '{"profile":"authoritative"}',
        executionHandle: "page-binding",
        executionEnvTag: "it",
        executionRunFlag: "page-run",
      })
    ).toBe(true);

    expect(exec.scriptRes.executionHandle).toBe("page-binding");
    expect(exec.scriptRes.executionEnvTag).toBe("it");
    expect(exec.scriptRes.executionRunFlag).toBe("page-run");
    expect(exec.scriptRes.value).toEqual({ secret: "authoritative-value" });
    expect(exec.scriptRes.config).toEqual({
      private: { secret: { title: "Private", description: "", index: 0, default: "authoritative" } },
    });
    expect(exec.scriptRes.userConfig).toEqual({
      account: { profile: { title: "Profile", description: "", index: 0, default: "authoritative" } },
    });
    expect(exec.scriptRes.userConfigStr).toBe('{"profile":"authoritative"}');
    expect(exec.execContext.GM_info).toMatchObject({
      userConfig: {
        account: { profile: { title: "Profile", description: "", index: 0, default: "authoritative" } },
      },
      userConfigStr: '{"profile":"authoritative"}',
      isIncognito: false,
      sandboxMode: "raw",
    });
    expect(exec.execContext.GM_info).toBe(gmInfo);
  });

  it("rejects a different early-start revision and cancels its pending GM work", async () => {
    const initial = {
      ...makeScript({
        uuid: "early-revision-mismatch",
        flag: "early-revision-mismatch-flag",
        createtime: 1,
        updatetime: 2,
        metadata: { grant: ["CAT_scriptLoaded", "GM.setValue"], "early-start": [""], "run-at": ["document-start"] },
      }),
      scriptRevision: "early-revision-mismatch:1:2",
    } as TScriptInfo;
    const authoritative = {
      ...initial,
      scriptRevision: "early-revision-mismatch:1:3",
      executionHandle: "current-binding",
      executionEnvTag: "it",
      executionRunFlag: "current-run",
    } as TScriptInfo;
    const sendMessage = vi.fn().mockResolvedValue({ code: 0 });
    const executor = new ScriptExecutor({ sendMessage } as unknown as Message, {} as Message);
    let loadPromise: Promise<void> | undefined;
    let setValuePromise: Promise<void> | undefined;
    executor.execScriptEntry({
      scriptLoadInfo: initial,
      scriptFlag: initial.flag,
      envInfo: initEnvInfo,
      scriptFunc: (_token: string, context: any) => {
        loadPromise = context.CAT_scriptLoaded();
        setValuePromise = context.GM.setValue("key", "value");
      },
    });
    const internal = executor as unknown as {
      earlyScriptFlags: Set<string>;
      execScripts: Map<string, { sandboxContext?: { isInvalidContext(): boolean } }>;
    };
    internal.earlyScriptFlags.add(initial.flag);

    executor.startScripts([authoritative], initEnvInfo);

    expect(internal.execScripts.has(initial.uuid)).toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(loadPromise).resolves.toBeUndefined(), { timeout: 100 });
    await vi.waitFor(() => expect(setValuePromise).resolves.toBeUndefined(), { timeout: 100 });
  });

  it("invalidates early-start scripts omitted from an authoritative pageLoad", () => {
    const early = {
      ...makeScript({
        uuid: "early-omitted-script",
        flag: "early-omitted-flag",
        metadata: { grant: ["GM_log"], "early-start": [""], "run-at": ["document-start"] },
      }),
      scriptRevision: "early-omitted-script:1:0",
    } as TScriptInfo;
    const other = {
      ...makeScript({ uuid: "current-script", flag: "current-script-flag" }),
      scriptRevision: "current-script:1:0",
      executionHandle: "current-binding",
      executionEnvTag: "it",
      executionRunFlag: "current-run",
    } as TScriptInfo;
    const executor = new ScriptExecutor({} as Message, {} as Message);
    executor.execScriptEntry({
      scriptLoadInfo: early,
      scriptFlag: early.flag,
      envInfo: initEnvInfo,
      scriptFunc: () => undefined,
    });
    const internal = executor as unknown as {
      earlyScriptFlags: Set<string>;
      execScripts: Map<
        string,
        {
          sandboxContext?: { isInvalidContext(): boolean };
          emitEvent(event: string, eventId: string, data: unknown): void;
          valueUpdate(data: unknown): void;
        }
      >;
    };
    internal.earlyScriptFlags.add(early.flag);
    const earlyExec = internal.execScripts.get(early.uuid)!;
    const emitEvent = vi.spyOn(earlyExec, "emitEvent");
    const valueUpdate = vi.spyOn(earlyExec, "valueUpdate");

    try {
      executor.startScripts([other], initEnvInfo);
      executor.emitEvent({ uuid: early.uuid, event: "menuClick", eventId: "menu-id" } as any);
      executor.valueUpdate({ uuid: early.uuid, storageName: "", entries: [], sender: { runFlag: "other" } } as any);

      expect(earlyExec.sandboxContext?.isInvalidContext()).toBe(true);
      expect(internal.execScripts.has(early.uuid)).toBe(false);
      expect(emitEvent).not.toHaveBeenCalled();
      expect(valueUpdate).not.toHaveBeenCalled();
    } finally {
      delete (window as unknown as Record<string, unknown>)[other.flag];
    }
  });

  it("requires a binding before reconciling an early script with GM grants", () => {
    const initial = {
      ...makeScript({
        uuid: "early-unbound-script",
        flag: "early-unbound-flag",
        metadata: { grant: ["GM_log"], "early-start": [""], "run-at": ["document-start"] },
      }),
      scriptRevision: "early-unbound-script:1:0",
    } as TScriptInfo;
    const executor = new ScriptExecutor({} as Message, {} as Message);
    executor.execScriptEntry({
      scriptLoadInfo: initial,
      scriptFlag: initial.flag,
      envInfo: initEnvInfo,
      scriptFunc: () => undefined,
    });
    const internal = executor as unknown as {
      earlyScriptFlags: Set<string>;
      execScripts: Map<string, { sandboxContext?: { isInvalidContext(): boolean } }>;
    };
    internal.earlyScriptFlags.add(initial.flag);
    const earlyExec = internal.execScripts.get(initial.uuid)!;
    const current = { ...initial } as TScriptInfo;

    executor.startScripts([current], initEnvInfo);

    expect(earlyExec.sandboxContext?.isInvalidContext()).toBe(true);
    expect(internal.execScripts.has(initial.uuid)).toBe(false);
  });

  it("ignores a counterfeit mount with a copied marker and keeps listening for the genuine wrapper", () => {
    const script = makeScript({ flag: "executor-counterfeit-flag", scriptRevision: "counterfeit-flag-revision" });
    const executor = new ScriptExecutor({} as Message, {} as Message);
    const pageWindow = window as unknown as Record<string, unknown>;
    const attacker = vi.fn((_token: string, context: unknown) => {
      Reflect.set(pageWindow, "__capturedExecutionContext", context);
    });
    Object.defineProperty(attacker, fnStrIntegrity, { value: true });

    try {
      executor.startScripts([script], initEnvInfo);
      pageWindow[script.flag] = attacker;

      expect(attacker).not.toHaveBeenCalled();
      expect(pageWindow.__capturedExecutionContext).toBeUndefined();

      mountInjectScript(script, "window.__genuineWrapperExecuted = true;");
      expect(pageWindow.__genuineWrapperExecuted).toBe(true);
      expect(attacker).not.toHaveBeenCalled();
    } finally {
      delete pageWindow[script.flag];
      delete pageWindow.__capturedExecutionContext;
      delete pageWindow.__genuineWrapperExecuted;
    }
  });

  it("rejects a counterfeit early-start wrapper before execution", () => {
    const script = makeScript({
      uuid: "executor-counterfeit-early-uuid",
      flag: "#-executor-counterfeit-early-uuid",
      metadata: { "early-start": [""], "run-at": ["document-start"] },
    });
    const executor = new ScriptExecutor({} as Message, {} as Message);
    const attacker = vi.fn();
    const pageWindow = window as unknown as Record<string, unknown>;

    try {
      pageWindow[script.flag] = attacker;
      executor.execEarlyScript(script.flag, initEnvInfo);
      expect(attacker).not.toHaveBeenCalled();

      mountPreInjectScript(script);
      expect(executor.execEarlyScript(script.flag, initEnvInfo)).toBe(true);
    } finally {
      delete pageWindow[script.flag];
    }
  });

  it("rejects an own toString spoof that impersonates the generated wrapper", () => {
    const script = makeScript({
      uuid: "executor-own-to-string-uuid",
      flag: "#-executor-own-to-string-uuid",
      metadata: { "early-start": [""], "run-at": ["document-start"] },
    });
    const pageWindow = window as unknown as Record<string, unknown>;
    mountPreInjectScript(script);
    const genuineSource = Function.prototype.toString.call(pageWindow[script.flag]);
    const attacker = vi.fn((token: string, context: unknown, marker: unknown) => {
      if (context === null && marker === document) return JSON.stringify(script);
      Reflect.set(pageWindow, "__capturedExecutionContext", context);
      return undefined;
    });
    Object.defineProperty(attacker, "toString", { value: () => genuineSource });
    const executor = new ScriptExecutor({} as Message, {} as Message);

    try {
      pageWindow[script.flag] = attacker;

      expect(executor.execEarlyScript(script.flag, initEnvInfo)).toBeUndefined();
      expect(attacker).not.toHaveBeenCalled();
      expect(pageWindow.__capturedExecutionContext).toBeUndefined();
    } finally {
      delete pageWindow[script.flag];
      delete pageWindow.__capturedExecutionContext;
    }
  });

  it("uses captured function source inspection when the page replaces toString", () => {
    const script = makeScript({ flag: "executor-spoofed-to-string-flag" });
    const targetWindow: Record<string, unknown> = {};
    const execute = new Function("window", compileInjectScript(script, "")) as (
      target: Record<string, unknown>
    ) => void;
    execute(targetWindow);
    const genuineSource = Function.prototype.toString.call(targetWindow[script.flag]);
    const attacker = vi.fn((token: string, target: unknown, marker: unknown) => {
      if (token === fnStrIntegrity && target === null && marker === document) {
        return JSON.stringify({ uuid: script.uuid, flag: script.flag });
      }
      Reflect.set(targetWindow, "__capturedExecutionContext", target);
    });
    Object.defineProperty(attacker, fnStrIntegrity, { value: true });
    const originalToString = Function.prototype.toString;
    const executor = new ScriptExecutor({} as Message, {} as Message);
    const pageWindow = window as unknown as Record<string, unknown>;

    try {
      Function.prototype.toString = function () {
        return genuineSource;
      };
      executor.startScripts([script], initEnvInfo);
      pageWindow[script.flag] = attacker;

      expect(attacker).not.toHaveBeenCalled();
      expect(targetWindow.__capturedExecutionContext).toBeUndefined();
    } finally {
      Function.prototype.toString = originalToString;
      delete pageWindow[script.flag];
      delete targetWindow[script.flag];
      delete targetWindow.__capturedExecutionContext;
    }
  });

  it("rejects page-copied early-start metadata on a counterfeit function", () => {
    const script = makeScript({
      uuid: "executor-forged-early-uuid",
      flag: "#-executor-forged-early-uuid",
      metadata: { "early-start": [""], "run-at": ["document-start"] },
    });
    const executor = new ScriptExecutor({} as Message, {} as Message);
    const counterfeit = vi.fn();
    attachLegacyPreInjectMetadata(counterfeit, script);

    try {
      (window as unknown as Record<string, unknown>)[script.flag] = counterfeit;
      expect(executor.execEarlyScript(script.flag, initEnvInfo)).toBeUndefined();
      expect(counterfeit).not.toHaveBeenCalled();
    } finally {
      delete (window as unknown as Record<string, unknown>)[script.flag];
    }
  });

  it("rejects early metadata that retargets the flag or carries a page binding", () => {
    const script = makeScript({ flag: "#-executor-test-uuid" });
    const executor = new ScriptExecutor({} as Message, {} as Message);
    const wrongUuid = vi.fn();
    const bound = vi.fn();
    const pageWindow = window as unknown as Record<string, unknown>;
    attachLegacyPreInjectMetadata(wrongUuid, { ...script, uuid: "other-script" } as TScriptInfo);
    attachLegacyPreInjectMetadata(bound, { ...script, executionHandle: "other-binding" } as TScriptInfo);

    try {
      pageWindow[script.flag] = wrongUuid;
      executor.execEarlyScript(script.flag, initEnvInfo);
      expect(wrongUuid).not.toHaveBeenCalled();

      pageWindow[script.flag] = bound;
      executor.execEarlyScript(script.flag, initEnvInfo);
      expect(bound).not.toHaveBeenCalled();
    } finally {
      delete pageWindow[script.flag];
    }
  });

  it("rejects same-UUID early metadata mutations", () => {
    const script = makeScript({
      uuid: "executor-early-authenticated-uuid",
      flag: "#-executor-early-authenticated-uuid",
      metadata: {
        grant: ["GM_getValue", "GM_getResourceText"],
        resource: ["canonical https://example.com/canonical"],
        "early-start": [""],
        "run-at": ["document-start"],
      },
      resource: {
        canonical: {
          url: "https://example.com/canonical",
          content: "canonical",
          base64: "",
          hash: { md5: "", sha1: "", sha256: "", sha384: "", sha512: "" },
          type: "resource",
          link: {},
          contentType: "text/plain",
          createtime: Date.now(),
        },
      },
    });
    const executor = new ScriptExecutor({} as Message, {} as Message);
    const pageWindow = window as unknown as Record<string, unknown>;
    const performance = { dispatchEvent: vi.fn(() => false), addEventListener: vi.fn() };
    const generated = new Function("window", "performance", "CustomEvent", compilePreInjectScript(script, ""));

    try {
      generated(pageWindow, performance, CustomEvent);
      const forged = {
        ...script,
        metadata: { grant: ["GM_setValue"] },
        resource: { forged: { content: "forged", contentType: "text/plain" } },
      } as TScriptInfo;

      executor.checkEarlyStartScript("it", initEnvInfo);
      const hostileDetail = {};
      const flagGetter = vi.fn(() => script.flag);
      Object.defineProperty(hostileDetail, "scriptFlag", { get: flagGetter });
      pageDispatchEvent(
        new CustomEvent(`evt${process.env.SC_RANDOM_KEY}.it${DefinedFlags.scriptLoadComplete}`, {
          detail: hostileDetail,
          cancelable: true,
        })
      );
      expect(flagGetter).not.toHaveBeenCalled();

      pageDispatchEvent(
        new CustomEvent(`evt${process.env.SC_RANDOM_KEY}.it${DefinedFlags.scriptLoadComplete}`, {
          detail: { scriptFlag: script.flag, scriptInfo: forged },
          cancelable: true,
        })
      );

      const exec = (
        executor as unknown as {
          execScripts: Map<string, { scriptRes: TScriptInfo }>;
        }
      ).execScripts.get(script.uuid);
      expect(exec?.scriptRes.metadata).toEqual(script.metadata);
      expect(exec?.scriptRes.resource).toEqual({
        canonical: { base64: "", content: "canonical", contentType: "text/plain" },
      });
    } finally {
      delete pageWindow[script.flag];
    }
  });

  it("accepts an early-start wrapper after a same-document URL change", () => {
    const script = makeScript({
      uuid: "executor-early-document-uuid",
      flag: "#-executor-early-document-uuid",
      metadata: { "early-start": [""], "run-at": ["document-start"] },
    });
    const executor = new ScriptExecutor({} as Message, {} as Message);
    const pageWindow = window as unknown as Record<string, unknown>;
    const initialUrl = window.location.href;

    try {
      window.history.pushState({}, "", `${initialUrl}#same-document-change`);
      mountPreInjectScript(script);
      expect(executor.execEarlyScript(script.flag, initEnvInfo)).toBe(true);
    } finally {
      window.history.replaceState({}, "", initialUrl);
      delete pageWindow[script.flag];
    }
  });

  it("continues loading later scripts after reconciling an early-start entry", () => {
    const early = {
      ...makeScript({
        uuid: "early-script",
        flag: "executor-early-batch",
        metadata: { "early-start": [""], "run-at": ["document-start"] },
      }),
      scriptRevision: "early-script:1:0",
    } as TScriptInfo;
    const later = makeScript({
      uuid: "later-script",
      flag: "executor-later-batch",
      scriptRevision: "later-batch-revision",
    });
    const executor = new ScriptExecutor({} as Message, {} as Message);
    executor.execScriptEntry({
      scriptLoadInfo: early,
      scriptFlag: early.flag,
      envInfo: initEnvInfo,
      scriptFunc: () => undefined,
    });

    const internal = executor as unknown as {
      earlyScriptFlags: Set<string>;
      execScripts: Map<string, { reconcileEarlyScript: (envInfo: GMInfoEnv, scriptInfo?: TScriptInfo) => boolean }>;
    };
    internal.earlyScriptFlags.add(early.flag);
    const reconcileEarlyScript = vi.spyOn(internal.execScripts.get(early.uuid)!, "reconcileEarlyScript");
    const pageWindow = window as unknown as Record<string, unknown>;

    try {
      executor.startScripts([early, later], initEnvInfo);
      mountInjectScript(later, "");

      expect(reconcileEarlyScript).toHaveBeenCalledWith(initEnvInfo, early);
      expect(internal.execScripts.has(later.uuid)).toBe(true);
    } finally {
      delete pageWindow[later.flag];
    }
  });

  describe("normal wrapper compiled-revision enforcement", () => {
    it("rejects a genuine wrapper compiled for an older revision, then accepts a later genuine match", () => {
      const authoritativeR1 = makeScript({
        uuid: "revision-mismatch-uuid",
        flag: "revision-mismatch-flag",
        scriptRevision: "revision-r1",
      });
      const authoritativeR2 = { ...authoritativeR1, scriptRevision: "revision-r2" };
      const executor = new ScriptExecutor({} as Message, {} as Message);
      const pageWindow = window as unknown as Record<string, unknown>;
      const internal = executor as unknown as { execScripts: Map<string, unknown> };

      try {
        // Service Worker 的权威数据已经是 R2；页面上真正挂载的 wrapper 却还带着编译时的 R1。
        executor.startScripts([authoritativeR2], initEnvInfo);
        mountInjectScript(authoritativeR1, "window.__r1Executed = true;");

        expect(pageWindow.__r1Executed).toBeUndefined();
        expect(internal.execScripts.has(authoritativeR1.uuid)).toBe(false);

        // 拒绝之后仍继续监听；随后到来的真正 R2 wrapper 必须能正常执行。
        mountInjectScript(authoritativeR2, "window.__r2Executed = true;");

        expect(pageWindow.__r2Executed).toBe(true);
        expect(internal.execScripts.has(authoritativeR2.uuid)).toBe(true);
      } finally {
        delete pageWindow[authoritativeR1.flag];
        delete pageWindow.__r1Executed;
        delete pageWindow.__r2Executed;
      }
    });

    it("rejects a genuine wrapper compiled without any scriptRevision (legacy shape) against authoritative revision data", () => {
      const legacyWrapperScript = makeScript({
        uuid: "revisionless-uuid",
        flag: "revisionless-flag",
        // scriptRevision 故意不设置：模拟这次安全修复落地前就已注册、仍留在浏览器里的旧 wrapper。
      });
      const authoritative = { ...legacyWrapperScript, scriptRevision: "revision-r2" };
      const executor = new ScriptExecutor({} as Message, {} as Message);
      const pageWindow = window as unknown as Record<string, unknown>;
      const internal = executor as unknown as { execScripts: Map<string, unknown> };

      try {
        executor.startScripts([authoritative], initEnvInfo);
        mountInjectScript(legacyWrapperScript, "window.__legacyExecuted = true;");

        expect(pageWindow.__legacyExecuted).toBeUndefined();
        expect(internal.execScripts.has(legacyWrapperScript.uuid)).toBe(false);
      } finally {
        delete pageWindow[legacyWrapperScript.flag];
        delete pageWindow.__legacyExecuted;
      }
    });
  });

  describe("resource execution", () => {
    let adoptedSheets: CSSStyleSheet[];

    beforeEach(() => {
      class MockCSSStyleSheet {
        cssText = "";

        replaceSync(css: string) {
          this.cssText = css;
        }
      }

      vi.stubGlobal("CSSStyleSheet", MockCSSStyleSheet);
      adoptedSheets = [];
      vi.spyOn(document, "adoptedStyleSheets", "get").mockImplementation(() => [...adoptedSheets]);
      vi.spyOn(document, "adoptedStyleSheets", "set").mockImplementation((value: CSSStyleSheet[]) => {
        adoptedSheets = [...value];
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("injects every resolved @require-css resource in declaration order", () => {
      const script = makeScript({
        metadata: { "require-css": [styleUrl, secondStyleUrl] },
        resource: {
          [secondStyleUrl]: {
            url: secondStyleUrl,
            content: "body { color: blue; }",
            base64: "",
            hash: { md5: "test", sha1: "test", sha256: "test", sha384: "test", sha512: "test" },
            type: "require-css",
            link: {},
            contentType: "text/css",
            createtime: Date.now(),
          },
          [styleUrl]: {
            url: styleUrl,
            content: "body { color: red; }",
            base64: "",
            hash: { md5: "test", sha1: "test", sha256: "test", sha384: "test", sha512: "test" },
            type: "require-css",
            link: {},
            contentType: "text/css",
            createtime: Date.now(),
          },
        },
      });

      const executor = new ScriptExecutor({} as Message, {} as Message);
      executor.execScriptEntry({
        scriptLoadInfo: script,
        scriptFlag: script.flag,
        envInfo: initEnvInfo,
        scriptFunc: () => undefined,
      });

      expect(adoptedSheets).toHaveLength(2);
      expect((adoptedSheets[0] as CSSStyleSheet & { cssText: string }).cssText).toBe("body { color: red; }");
      expect((adoptedSheets[1] as CSSStyleSheet & { cssText: string }).cssText).toBe("body { color: blue; }");
    });

    it("uses the category-specific CSS resource when a key collides", () => {
      const script = makeScript({
        metadata: { "require-css": [styleUrl] },
        resource: {
          [styleUrl]: {
            url: styleUrl,
            content: "not css",
            base64: "",
            hash: { md5: "test", sha1: "test", sha256: "test", sha384: "test", sha512: "test" },
            type: "resource",
            link: {},
            contentType: "text/plain",
            createtime: Date.now(),
          },
        },
        requireCssResource: {
          [styleUrl]: {
            content: "body { color: green; }",
            contentType: "text/css",
          },
        },
      });

      const executor = new ScriptExecutor({} as Message, {} as Message);
      executor.execScriptEntry({
        scriptLoadInfo: script,
        scriptFlag: script.flag,
        envInfo: initEnvInfo,
        scriptFunc: () => undefined,
      });

      expect((adoptedSheets[0] as CSSStyleSheet & { cssText: string }).cssText).toBe("body { color: green; }");
    });
  });
});
