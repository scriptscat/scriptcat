import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { Message } from "@Packages/message/types";
import type { ScriptLoadInfo } from "../service_worker/types";
import type { TScriptInfo } from "@App/app/repo/scripts";
import { initEnvInfo, ScriptExecutor } from "./script_executor";
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
    resource: {},
    metadata: {},
    originalMetadata: {},
    metadataStr: "",
    userConfigStr: "",
    ...overrides,
  };
}

describe("ScriptExecutor", () => {
  it("一个尚未出现脚本 flag 的 userscript 可先接收 r2，再只执行一次", () => {
    const executor = new ScriptExecutor({} as Message, {} as Message);
    const script = makeScript({
      uuid: "late-value-1",
      flag: "late-executor-1",
      value: { k: 1 }, valueRevision: 1, valueEpoch: "epoch",
      metadata: { grant: ["GM_getValue"] },
    });
    const actual: unknown[] = [];
    executor.startScripts([script as TScriptInfo], initEnvInfo);
    expect(executor.execScriptMap.size).toBe(0);
    executor.valueUpdate({
      id: "r2", uuid: script.uuid, storageName: script.uuid,
      entries: [["k", encodeRValue(2), encodeRValue(1)]], valueUpdated: true,
      sender: { runFlag: "other" }, revision: 2, epoch: "epoch",
    });
    (window as any)[script.flag] = function (this: any) {
      actual.push(this.GM_getValue("k"));
    };
    expect(actual).toEqual([2]);
    expect(executor.execScriptMap.size).toBe(1);
  });

  it("两个独立 world 等待同一 storageName，接收 snapshot 后首次运行均读到新值", () => {
    const executions: unknown[] = [];
    const worlds = ["content", "inject"].map((name) => {
      const executor = new ScriptExecutor({} as Message, {} as Message);
      const script = makeScript({
        uuid: `late-${name}`, flag: `late-script-${name}`,
        metadata: { storagename: ["shared"], grant: ["GM_getValue"], "run-at": ["document-body"] },
        value: { k: 1 }, valueRevision: 1, valueEpoch: "epoch",
      });
      executor.startScripts([script as TScriptInfo], initEnvInfo);
      executor.valueSnapshot({ storageName: "shared", epoch: "epoch", revision: 2, values: { k: 2 } });
      return { executor, script, name };
    });
    for (const { script, name } of worlds) {
      (window as any)[script.flag] = function (this: any) {
        executions.push([name, this.GM_getValue("k")]);
      };
    }
    expect(executions).toEqual([["content", 2], ["inject", 2]]);
    expect(worlds.map(({ executor }) => executor.execScriptMap.size)).toEqual([1, 1]);
  });

  it("一个已运行脚本处理失败时，仍尝试通知共享存储的其他脚本", () => {
    const executor = new ScriptExecutor({} as Message, {} as Message);
    for (const uuid of ["bad", "good"]) {
      const script = makeScript({ uuid, flag: `flag-${uuid}`,
        metadata: { storagename: ["shared"], grant: [] } });
      executor.execScriptEntry({
        scriptLoadInfo: script as TScriptInfo,
        scriptFlag: script.flag,
        envInfo: initEnvInfo,
        scriptFunc: () => undefined,
      });
    }
    const bad = vi.spyOn(executor.execScriptMap.get("bad")!, "valueUpdate").mockImplementation(() => {
      throw new Error("bad GM script");
    });
    const good = vi.spyOn(executor.execScriptMap.get("good")!, "valueUpdate").mockReturnValue(undefined);
    expect(() => executor.valueUpdate({
      id: "x", uuid: "bad", storageName: "shared", entries: [],
      sender: { runFlag: "remote" }, valueUpdated: false, revision: 1, epoch: "e",
    })).toThrow("bad GM script");
    expect(bad).toHaveBeenCalledOnce();
    expect(good).toHaveBeenCalledOnce();
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
