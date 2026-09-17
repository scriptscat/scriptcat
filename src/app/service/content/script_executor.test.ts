import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { Message } from "@Packages/message/types";
import type { ScriptLoadInfo } from "../service_worker/types";
import type { TScriptInfo } from "@App/app/repo/scripts";
import type { GMInfoEnv } from "./types";
import { initEnvInfo, ScriptExecutor } from "./script_executor";

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
        execScripts: Array<{
          exec: {
            scriptRes: TScriptInfo;
            updateEarlyScriptGMInfo: (envInfo: GMInfoEnv, scriptInfo?: TScriptInfo) => void;
          };
        }>;
      }
    ).execScripts[0].exec;
    expect(exec.scriptRes.executionHandle).toBeUndefined();

    exec.updateEarlyScriptGMInfo(initEnvInfo, {
      ...initial,
      executionHandle: "page-binding",
      executionEnvTag: "it",
    });

    expect(exec.scriptRes.executionHandle).toBe("page-binding");
    expect(exec.scriptRes.executionEnvTag).toBe("it");
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
      executor.execEarlyScript(script.flag, script, initEnvInfo);
      expect(attacker).not.toHaveBeenCalled();

      pageWindow[script.flag] = genuine;
      executor.execEarlyScript(script.flag, script, initEnvInfo);
      expect(genuine).toHaveBeenCalledWith(fnStrIntegrity, expect.anything(), undefined, script.name);
    } finally {
      delete pageWindow[script.flag];
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
