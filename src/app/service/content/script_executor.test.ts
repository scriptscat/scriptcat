import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { Message } from "@Packages/message/types";
import type { ScriptLoadInfo } from "../service_worker/types";
import type { TScriptInfo } from "@App/app/repo/scripts";
import { initEnvInfo, ScriptExecutor } from "./script_executor";
import ExecScript from "./exec_script";
import { compileInjectScript, compilePreInjectScript, compileScriptCode } from "./utils";
import { pageDispatchEvent } from "@Packages/message/common";
import { ScriptEnvTag } from "@Packages/message/consts";
import { encodeRValue } from "@App/pkg/utils/message_value";

const styleUrl = "https://example.com/style.css";
const secondStyleUrl = "https://example.com/second-style.css";
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
    scriptRevision: "executor-test-revision",
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

  it("ignores a counterfeit mount and keeps listening for the genuine wrapper", () => {
    const script = makeScript({ flag: "executor-counterfeit-flag" });
    const executor = new ScriptExecutor({} as Message, {} as Message);
    const generatedWindow: Record<string, unknown> = {};
    const runGenerated = new Function(
      "window",
      "performance",
      "CustomEvent",
      compileInjectScript(script, "window.__genuineMountRan = true;")
    );
    runGenerated(generatedWindow, performance, CustomEvent);
    const genuine = generatedWindow[script.flag];
    const attacker = vi.fn();
    const pageWindow = window as unknown as Record<string, unknown>;

    try {
      executor.startScripts([script], initEnvInfo);
      pageWindow[script.flag] = attacker;

      expect(attacker).not.toHaveBeenCalled();
      expect(generatedWindow.__genuineMountRan).toBeUndefined();

      pageWindow[script.flag] = genuine;

      expect(generatedWindow.__genuineMountRan).toBe(true);
    } finally {
      delete pageWindow[script.flag];
    }
  });

  it("rejects a genuine wrapper relayed from another script flag", () => {
    const sourceScript = makeScript({ uuid: "source-script", flag: "executor-source-flag" });
    const targetScript = makeScript({ uuid: "target-script", flag: "executor-target-flag" });
    const executor = new ScriptExecutor({} as Message, {} as Message);
    const generatedWindow: Record<string, unknown> = {};
    const runGenerated = new Function(
      "window",
      "performance",
      "CustomEvent",
      compileInjectScript(sourceScript, "return 'source';")
    );
    const pageWindow = window as unknown as Record<string, unknown>;

    try {
      runGenerated(generatedWindow, performance, CustomEvent);
      const relayed = generatedWindow[sourceScript.flag];
      executor.startScripts([targetScript], initEnvInfo);
      pageWindow[targetScript.flag] = relayed;

      expect(
        (
          executor as unknown as {
            execScripts: Map<string, unknown>;
          }
        ).execScripts.has(targetScript.uuid)
      ).toBe(false);
    } finally {
      delete pageWindow[sourceScript.flag];
      delete pageWindow[targetScript.flag];
    }
  });

  it("rejects a same-source wrapper created with a page-chosen call token", () => {
    const script = makeScript({ flag: "executor-forged-token-flag" });
    const executor = new ScriptExecutor({} as Message, {} as Message);
    const source = compileInjectScript(script, "window.__forgedRan = true;");
    const token = JSON.stringify(process.env.SC_RANDOM_FNKEY!);
    const counterfeitSource = source.replace(`})(${token},`, `})("page-chosen-token",`);
    const runCounterfeit = new Function("window", "performance", "CustomEvent", counterfeitSource);
    const counterfeitWindow: Record<string, unknown> = {};
    const pageWindow = window as unknown as Record<string, unknown>;

    expect(counterfeitSource).not.toBe(source);

    try {
      runCounterfeit(counterfeitWindow, performance, CustomEvent);
      executor.startScripts([script], initEnvInfo);
      pageWindow[script.flag] = counterfeitWindow[script.flag];

      expect(pageWindow.__forgedRan).toBeUndefined();

      const genuineWindow: Record<string, unknown> = {};
      const runGenuine = new Function("window", "performance", "CustomEvent", source);
      runGenuine(genuineWindow, performance, CustomEvent);
      pageWindow[script.flag] = genuineWindow[script.flag];
      expect(genuineWindow.__forgedRan).toBe(true);
    } finally {
      delete pageWindow[script.flag];
    }
  });

  it("rejects a pre-injected wrapper captured from a different document", () => {
    const script = makeScript({ flag: "executor-cross-document-flag" });
    const executor = new ScriptExecutor({} as Message, {} as Message);
    const sourceWindow: Record<string, unknown> = {};
    const sourceDocument = {};
    const runGenerated = new Function(
      "window",
      "performance",
      "CustomEvent",
      "document",
      compilePreInjectScript(script, "window.__relayedEarlyRan = true;")
    );
    const pageWindow = window as unknown as Record<string, unknown>;

    try {
      runGenerated(
        sourceWindow,
        { dispatchEvent: () => true, addEventListener: () => undefined },
        CustomEvent,
        sourceDocument
      );
      pageWindow[script.flag] = sourceWindow[script.flag];

      executor.startScripts([script], initEnvInfo);

      expect(
        (
          executor as unknown as {
            execScripts: Map<string, unknown>;
          }
        ).execScripts.has(script.uuid)
      ).toBe(false);
      expect(sourceWindow.__relayedEarlyRan).toBeUndefined();
    } finally {
      delete pageWindow[script.flag];
    }
  });

  it("executes early-start code before page-load while its GM calls wait for the trusted binding", async () => {
    const script = makeScript({
      uuid: "executor-early-start-uuid",
      flag: "executor-early-start-flag",
      metadata: { grant: ["GM_log"], "early-start": [""], "run-at": ["document-start"] },
      userConfig: {
        General: { privateKey: { title: "Private", description: "", value: "secret", index: 0 } },
      },
      userConfigStr: "private settings",
    });
    const sendMessage = vi.fn().mockResolvedValue({ data: undefined });
    const executor = new ScriptExecutor({ sendMessage } as unknown as Message, {} as Message);
    const pageWindow = window as unknown as Record<string, unknown>;
    const generated = new Function(
      "window",
      "performance",
      "CustomEvent",
      compilePreInjectScript(
        script,
        compileScriptCode(
          script,
          'unsafeWindow.__earlyStartRan = true; unsafeWindow.__earlyStartInfo = GM_info; GM_log("early start");'
        )
      )
    );
    const testPerformance = { dispatchEvent: () => true, addEventListener: () => undefined };
    const valueUpdate = vi.spyOn(ExecScript.prototype, "valueUpdate");

    try {
      generated(pageWindow, testPerformance, CustomEvent);
      expect(pageWindow.__earlyStartRan).toBeUndefined();
      executor.checkEarlyStartScript(ScriptEnvTag.inject, initEnvInfo);
      pageDispatchEvent(
        new CustomEvent(`evt${process.env.SC_RANDOM_KEY}.it.slc`, {
          cancelable: true,
          detail: { scriptFlag: script.flag },
        })
      );
      expect(pageWindow.__earlyStartRan).toBe(true);
      expect((pageWindow.__earlyStartInfo as { userConfig?: unknown }).userConfig).toBeUndefined();
      expect((pageWindow.__earlyStartInfo as { userConfigStr?: string }).userConfigStr).toBe("");
      expect(sendMessage).not.toHaveBeenCalled();
      executor.valueUpdate({
        entries: [["key", encodeRValue("early update"), encodeRValue(undefined)]],
        uuid: script.uuid,
        storageName: script.uuid,
        sender: { runFlag: "untrusted-run-flag", tabId: -2 },
        valueUpdated: true,
      });
      expect(valueUpdate).not.toHaveBeenCalled();

      executor.startScripts(
        [
          {
            ...script,
            executionHandle: "trusted-page-binding",
            executionEnvTag: "it",
            executionRunFlag: "trusted-run-flag",
            userConfig: {
              General: { privateKey: { title: "Private", description: "", value: "current", index: 0 } },
            },
            userConfigStr: "current settings",
          } as unknown as TScriptInfo,
        ],
        initEnvInfo
      );
      expect(pageWindow.__earlyStartRan).toBe(true);
      expect((pageWindow.__earlyStartInfo as { userConfig?: unknown }).userConfig).toMatchObject({
        General: { privateKey: { value: "current" } },
      });
      expect((pageWindow.__earlyStartInfo as { userConfigStr?: string }).userConfigStr).toBe("current settings");
      expect(
        (
          executor as unknown as {
            execScripts: Map<string, { scriptRes: TScriptInfo }>;
          }
        ).execScripts.get(script.uuid)?.scriptRes.executionHandle
      ).toBe("trusted-page-binding");
      executor.valueUpdate({
        entries: [["key", encodeRValue("trusted update"), encodeRValue(undefined)]],
        uuid: script.uuid,
        storageName: script.uuid,
        sender: { runFlag: "untrusted-run-flag", tabId: -2 },
        valueUpdated: true,
      });
      expect(valueUpdate).toHaveBeenCalledTimes(1);
      await vi.waitFor(() =>
        expect(sendMessage).toHaveBeenCalledWith({
          action: "scripting/runtime/gmApi",
          data: expect.objectContaining({
            version: 1,
            handle: "trusted-page-binding",
            api: "GM_log",
          }),
        })
      );
    } finally {
      valueUpdate.mockRestore();
      delete pageWindow[script.flag];
      delete pageWindow.__earlyStartInfo;
      delete pageWindow.__earlyStartRan;
    }
  });

  it("does not execute an unprivileged fallback wrapper again when native binding arrives", () => {
    const fallbackScript = makeScript({
      uuid: "executor-fallback-native-uuid",
      flag: "executor-fallback-native-flag",
      metadata: { grant: ["none"] },
      userConfigStr: "",
    });
    const nativeScript = {
      ...fallbackScript,
      userConfigStr: "trusted native config",
      executionHandle: "native-fallback-binding",
      executionEnvTag: "it",
      executionRunFlag: "native-fallback-run",
    } as unknown as TScriptInfo;
    const executor = new ScriptExecutor({} as Message, {} as Message);
    const pageWindow = window as unknown as Record<string, unknown>;
    const generated = new Function(
      "window",
      "performance",
      "CustomEvent",
      compileInjectScript(fallbackScript, "window.__fallbackNativeRuns = (window.__fallbackNativeRuns || 0) + 1;")
    );

    try {
      executor.startScripts([fallbackScript as unknown as TScriptInfo], initEnvInfo, { reconcileEarlyScripts: false });
      generated(pageWindow, performance, CustomEvent);
      expect(pageWindow.__fallbackNativeRuns).toBe(1);

      executor.startScripts([nativeScript], initEnvInfo);

      expect(pageWindow.__fallbackNativeRuns).toBe(1);
      const existingExec = (executor as unknown as { execScripts: Map<string, ExecScript> }).execScripts.get(
        fallbackScript.uuid
      );
      expect(existingExec?.scriptRes.executionHandle).toBe("native-fallback-binding");
      expect(existingExec?.named?.GM_info.userConfigStr).toBe("trusted native config");
    } finally {
      delete pageWindow[fallbackScript.flag];
      delete pageWindow.__fallbackNativeRuns;
    }
  });

  it("does not replay an early-start wrapper absent from the trusted page-load list", () => {
    const script = makeScript({
      uuid: "executor-removed-early-uuid",
      flag: "executor-removed-early-flag",
      metadata: { grant: ["GM_log"], "early-start": [""], "run-at": ["document-start"] },
    });
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const executor = new ScriptExecutor({ sendMessage } as unknown as Message, {} as Message);
    const execScriptEntry = vi.spyOn(executor, "execScriptEntry");
    const pageWindow = window as unknown as Record<string, unknown>;
    const generated = new Function(
      "window",
      "performance",
      "CustomEvent",
      compilePreInjectScript(script, 'window.__removedEarlyRan = true; GM_log("removed early start");')
    );

    try {
      generated(pageWindow, { dispatchEvent: () => true, addEventListener: () => undefined }, CustomEvent);
      executor.checkEarlyStartScript(ScriptEnvTag.inject, initEnvInfo);
      pageDispatchEvent(
        new CustomEvent(`evt${process.env.SC_RANDOM_KEY}.it.slc`, {
          cancelable: true,
          detail: { scriptFlag: script.flag },
        })
      );
      expect(execScriptEntry).toHaveBeenCalledTimes(1);

      executor.startScripts([], initEnvInfo);
      pageDispatchEvent(
        new CustomEvent(`evt${process.env.SC_RANDOM_KEY}.it.slc`, {
          cancelable: true,
          detail: { scriptFlag: script.flag },
        })
      );

      expect(sendMessage).not.toHaveBeenCalled();
      expect(execScriptEntry).toHaveBeenCalledTimes(1);
      expect(
        (
          executor as unknown as {
            execScripts: Map<string, unknown>;
          }
        ).execScripts.has(script.uuid)
      ).toBe(false);
    } finally {
      execScriptEntry.mockRestore();
      delete pageWindow[script.flag];
      delete pageWindow.__removedEarlyRan;
    }
  });

  it("does not reconcile early-start contexts against page-visible fallback scripts", () => {
    const earlyScript = makeScript({
      uuid: "executor-fallback-early-uuid",
      flag: "executor-fallback-early-flag",
      metadata: { grant: ["GM_log"], "early-start": [""], "run-at": ["document-start"] },
    });
    const fallbackScript = makeScript({
      uuid: "executor-fallback-safe-uuid",
      flag: "executor-fallback-safe-flag",
      metadata: { grant: ["none"] },
    }) as unknown as TScriptInfo;
    const executor = new ScriptExecutor({} as Message, {} as Message);
    const pageWindow = window as unknown as Record<string, unknown>;
    const generated = new Function(
      "window",
      "performance",
      "CustomEvent",
      compilePreInjectScript(earlyScript, "window.__fallbackEarlyRan = true;")
    );

    try {
      generated(pageWindow, { dispatchEvent: () => true, addEventListener: () => undefined }, CustomEvent);
      executor.checkEarlyStartScript(ScriptEnvTag.inject, initEnvInfo);
      pageDispatchEvent(
        new CustomEvent(`evt${process.env.SC_RANDOM_KEY}.it.slc`, {
          cancelable: true,
          detail: { scriptFlag: earlyScript.flag },
        })
      );
      const execScripts = (executor as unknown as { execScripts: Map<string, ExecScript> }).execScripts;
      const earlyExec = execScripts.get(earlyScript.uuid);
      expect(earlyExec).toBeDefined();

      executor.startScripts([fallbackScript], initEnvInfo, { reconcileEarlyScripts: false });

      expect(execScripts.get(earlyScript.uuid)).toBe(earlyExec);
      expect(pageWindow.__fallbackEarlyRan).toBe(true);
    } finally {
      delete pageWindow[earlyScript.flag];
      delete pageWindow[fallbackScript.flag];
      delete pageWindow.__fallbackEarlyRan;
    }
  });

  it("invalidates early-start code whose revision differs from page-load before releasing GM calls", async () => {
    const staleScript = makeScript({
      uuid: "executor-stale-early-uuid",
      flag: "executor-stale-early-flag",
      scriptRevision: "revision-old",
      metadata: { grant: ["GM_log"], "early-start": [""], "run-at": ["document-start"] },
    });
    const currentScript = { ...staleScript, scriptRevision: "revision-current" };
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const executor = new ScriptExecutor({ sendMessage } as unknown as Message, {} as Message);
    const execScriptEntry = vi.spyOn(executor, "execScriptEntry");
    const pageWindow = window as unknown as Record<string, unknown>;
    const generated = new Function(
      "window",
      "performance",
      "CustomEvent",
      compilePreInjectScript(staleScript, 'window.__staleEarlyRan = true; GM_log("stale early start");')
    );

    try {
      generated(pageWindow, { dispatchEvent: () => true, addEventListener: () => undefined }, CustomEvent);
      executor.checkEarlyStartScript(ScriptEnvTag.inject, initEnvInfo);
      pageDispatchEvent(
        new CustomEvent(`evt${process.env.SC_RANDOM_KEY}.it.slc`, {
          cancelable: true,
          detail: { scriptFlag: staleScript.flag },
        })
      );
      expect(execScriptEntry).toHaveBeenCalledTimes(1);
      expect(sendMessage).not.toHaveBeenCalled();

      executor.startScripts(
        [
          {
            ...currentScript,
            executionHandle: "current-binding",
            executionEnvTag: "it",
            executionRunFlag: "current-run-flag",
          } as unknown as TScriptInfo,
        ],
        initEnvInfo
      );
      await Promise.resolve();
      pageDispatchEvent(
        new CustomEvent(`evt${process.env.SC_RANDOM_KEY}.it.slc`, {
          cancelable: true,
          detail: { scriptFlag: staleScript.flag },
        })
      );

      expect(pageWindow.__staleEarlyRan).toBe(true);
      expect(execScriptEntry).toHaveBeenCalledTimes(1);
      expect(sendMessage).not.toHaveBeenCalled();
      expect(
        (
          executor as unknown as {
            execScripts: Map<string, unknown>;
          }
        ).execScripts.has(staleScript.uuid)
      ).toBe(false);
    } finally {
      execScriptEntry.mockRestore();
      delete pageWindow[staleScript.flag];
      delete pageWindow.__staleEarlyRan;
    }
  });

  it("rejects an older wrapper for the same UUID and flag", () => {
    const staleScript = makeScript({
      uuid: "executor-stale-revision-uuid",
      flag: "executor-stale-revision-flag",
      scriptRevision: "revision-old",
    });
    const currentScript = { ...staleScript, scriptRevision: "revision-current" };
    const executor = new ScriptExecutor({} as Message, {} as Message);
    const pageWindow = window as unknown as Record<string, unknown>;
    const staleWindow: Record<string, unknown> = {};
    const currentWindow: Record<string, unknown> = {};
    const runStale = new Function(
      "window",
      "performance",
      "CustomEvent",
      compileInjectScript(staleScript, "window.__staleRan = true;")
    );
    const runCurrent = new Function(
      "window",
      "performance",
      "CustomEvent",
      compileInjectScript(currentScript, "window.__currentRan = true;")
    );

    try {
      runStale(staleWindow, performance, CustomEvent);
      executor.startScripts([currentScript], initEnvInfo);
      pageWindow[currentScript.flag] = staleWindow[currentScript.flag];
      expect(pageWindow.__staleRan).toBeUndefined();

      runCurrent(currentWindow, performance, CustomEvent);
      pageWindow[currentScript.flag] = currentWindow[currentScript.flag];
      expect(currentWindow.__currentRan).toBe(true);
    } finally {
      delete pageWindow[currentScript.flag];
    }
  });

  it("continues loading later scripts after a matching script is mounted", () => {
    const first = makeScript({ uuid: "first-script", flag: "executor-first-batch" });
    const later = makeScript({ uuid: "later-script", flag: "executor-later-batch" });
    const executor = new ScriptExecutor({} as Message, {} as Message);
    const generatedWindow: Record<string, unknown> = {};
    const runGenerated = new Function(
      "window",
      "performance",
      "CustomEvent",
      compileInjectScript(later, "window.__laterRan = true;")
    );
    runGenerated(generatedWindow, performance, CustomEvent);
    const pageWindow = window as unknown as Record<string, unknown>;

    try {
      executor.startScripts([first, later], initEnvInfo);
      pageWindow[later.flag] = generatedWindow[later.flag];

      expect(generatedWindow.__laterRan).toBe(true);
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
