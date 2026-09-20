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
    const initial = makeScript({ metadata: { "early-start": [""], "run-at": ["document-start"] } });
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
            updateEarlyScriptGMInfo: (envInfo: GMInfoEnv, scriptInfo?: TScriptInfo) => void;
          }
        >;
      }
    ).execScripts.get(initial.uuid)!;
    expect(exec.scriptRes.executionHandle).toBeUndefined();

    exec.updateEarlyScriptGMInfo(initEnvInfo, {
      ...initial,
      value: { secret: "authoritative-value" },
      config: {
        private: { secret: { title: "Private", description: "", index: 0, default: "authoritative" } },
      },
      executionHandle: "page-binding",
      executionEnvTag: "it",
    });

    expect(exec.scriptRes.executionHandle).toBe("page-binding");
    expect(exec.scriptRes.executionEnvTag).toBe("it");
    expect(exec.scriptRes.value).toEqual({ secret: "authoritative-value" });
    expect(exec.scriptRes.config).toEqual({
      private: { secret: { title: "Private", description: "", index: 0, default: "authoritative" } },
    });
  });

  it("ignores a counterfeit mount with a copied marker and keeps listening for the genuine wrapper", () => {
    const script = makeScript({ flag: "executor-counterfeit-flag" });
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
    const early = makeScript({
      uuid: "early-script",
      flag: "executor-early-batch",
      metadata: { "early-start": [""], "run-at": ["document-start"] },
    });
    const later = makeScript({ uuid: "later-script", flag: "executor-later-batch" });
    const executor = new ScriptExecutor({} as Message, {} as Message);
    executor.execScriptEntry({
      scriptLoadInfo: early,
      scriptFlag: early.flag,
      envInfo: initEnvInfo,
      scriptFunc: () => undefined,
    });

    const internal = executor as unknown as {
      earlyScriptFlags: Set<string>;
      execScripts: Map<string, { updateEarlyScriptGMInfo: (envInfo: GMInfoEnv, scriptInfo?: TScriptInfo) => void }>;
    };
    internal.earlyScriptFlags.add(early.flag);
    const updateEarlyScriptGMInfo = vi.spyOn(internal.execScripts.get(early.uuid)!, "updateEarlyScriptGMInfo");
    const pageWindow = window as unknown as Record<string, unknown>;

    try {
      executor.startScripts([early, later], initEnvInfo);
      mountInjectScript(later, "");

      expect(updateEarlyScriptGMInfo).toHaveBeenCalledWith(initEnvInfo, early);
      expect(internal.execScripts.has(later.uuid)).toBe(true);
    } finally {
      delete pageWindow[later.flag];
    }
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
