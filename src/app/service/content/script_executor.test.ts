import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { Message } from "@Packages/message/types";
import type { ScriptLoadInfo } from "../service_worker/types";
import type { TScriptInfo } from "@App/app/repo/scripts";
import type { GMInfoEnv } from "./types";
import { initEnvInfo, ScriptExecutor } from "./script_executor";
import { compilePreInjectScript, preInjectScriptInfoKey } from "./utils";
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

  it("ignores a counterfeit mount and keeps listening for the genuine wrapper", () => {
    const script = makeScript({ flag: "executor-counterfeit-flag" });
    const executor = new ScriptExecutor({} as Message, {} as Message);
    const attackerTarget = vi.fn();
    const attacker = new Proxy(attackerTarget, {
      getOwnPropertyDescriptor(target, property) {
        if (property === fnStrIntegrity) {
          return { configurable: true, enumerable: false, value: true, writable: true };
        }
        return Object.getOwnPropertyDescriptor(target, property);
      },
    });
    const genuine = vi.fn();
    const pageWindow = window as unknown as Record<string, unknown>;
    Object.defineProperty(genuine, fnStrIntegrity, { value: true });

    try {
      executor.startScripts([script], initEnvInfo);
      pageWindow[script.flag] = attacker;

      expect(attackerTarget).not.toHaveBeenCalled();

      pageWindow[script.flag] = genuine;

      expect(genuine).toHaveBeenCalledWith(fnStrIntegrity, expect.anything(), undefined, script.name);
    } finally {
      delete pageWindow[script.flag];
    }
  });

  it("rejects a counterfeit early-start wrapper before execution", () => {
    const script = makeScript({ flag: "executor-counterfeit-early-flag" });
    const executor = new ScriptExecutor({} as Message, {} as Message);
    const attacker = vi.fn();
    const genuine = vi.fn();
    const pageWindow = window as unknown as Record<string, unknown>;
    Object.defineProperty(genuine, fnStrIntegrity, { value: true });

    try {
      pageWindow[script.flag] = attacker;
      executor.execEarlyScript(script.flag, initEnvInfo);
      expect(attacker).not.toHaveBeenCalled();

      pageWindow[script.flag] = genuine;
      Object.defineProperty(genuine, preInjectScriptInfoKey, { value: JSON.stringify(script) });
      executor.execEarlyScript(script.flag, initEnvInfo);
      expect(genuine).toHaveBeenCalledWith(fnStrIntegrity, expect.anything(), undefined, script.name);
    } finally {
      delete pageWindow[script.flag];
    }
  });

  it("rejects early metadata that retargets the flag or carries a page binding", () => {
    const script = makeScript({ flag: "#-executor-test-uuid" });
    const executor = new ScriptExecutor({} as Message, {} as Message);
    const wrongUuid = vi.fn();
    const bound = vi.fn();
    const pageWindow = window as unknown as Record<string, unknown>;
    Object.defineProperty(wrongUuid, fnStrIntegrity, { value: true });
    Object.defineProperty(wrongUuid, preInjectScriptInfoKey, {
      value: JSON.stringify({ ...script, uuid: "other-script" }),
    });
    Object.defineProperty(bound, fnStrIntegrity, { value: true });
    Object.defineProperty(bound, preInjectScriptInfoKey, {
      value: JSON.stringify({ ...script, executionHandle: "other-binding" }),
    });

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
      metadata: { grant: ["GM_getValue", "GM_getResourceText"], resource: ["canonical https://example.com/canonical"] },
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

  it("accepts the immutable early manifest through the wrapper name fallback", () => {
    const script = makeScript({ uuid: "executor-early-name-uuid", flag: "#-executor-early-name-uuid" });
    const executor = new ScriptExecutor({} as Message, {} as Message);
    const genuine = vi.fn();
    const pageWindow = window as unknown as Record<string, unknown>;
    Object.defineProperty(genuine, fnStrIntegrity, { value: true });
    Object.defineProperty(genuine, "name", { configurable: false, value: JSON.stringify(script) });

    try {
      pageWindow[script.flag] = genuine;
      executor.execEarlyScript(script.flag, initEnvInfo);
      expect(genuine).toHaveBeenCalledWith(fnStrIntegrity, expect.anything(), undefined, script.name);
    } finally {
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
    const genuine = vi.fn();
    Object.defineProperty(genuine, fnStrIntegrity, { value: true });
    const pageWindow = window as unknown as Record<string, unknown>;

    try {
      executor.startScripts([early, later], initEnvInfo);
      pageWindow[later.flag] = genuine;

      expect(updateEarlyScriptGMInfo).toHaveBeenCalledWith(initEnvInfo, early);
      expect(genuine).toHaveBeenCalledWith(fnStrIntegrity, expect.anything(), undefined, later.name);
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
