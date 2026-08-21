import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { Message } from "@Packages/message/types";
import type { ScriptLoadInfo } from "../service_worker/types";
import { initEnvInfo, ScriptExecutor } from "./script_executor";

const styleUrl = "https://example.com/style.css";

function makeScript(overrides: Partial<ScriptLoadInfo> = {}): ScriptLoadInfo {
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

function makeValueUpdate(overrides: Partial<Parameters<ScriptExecutor["valueUpdate"]>[0]> = {}) {
  return {
    id: "value-update-id",
    entries: [],
    uuid: "missing-uuid",
    storageName: "missing-storage",
    sender: { runFlag: "remote-run" },
    valueUpdated: true,
    ...overrides,
  };
}

describe("ScriptExecutor", () => {
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
        metadata: { "require-css": [styleUrl] },
        resource: {
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

      expect(adoptedSheets).toHaveLength(1);
      expect((adoptedSheets[0] as CSSStyleSheet & { cssText: string }).cssText).toBe("body { color: red; }");
    });
  });

  describe("value update routing", () => {
    it("delivers UUID and shared-storage matches once, preserving registration order", () => {
      const executor = new ScriptExecutor({} as Message, {} as Message);
      const delivered: string[] = [];
      const add = (uuid: string, storageName: string) => {
        executor.execScriptMap.set(uuid, {
          scriptRes: { uuid, metadata: storageName ? { storagename: [storageName] } : {} },
          valueUpdate: vi.fn(() => delivered.push(uuid)),
        } as never);
      };

      add("first", "shared-storage");
      add("second", "shared-storage");
      add("third", "other-storage");

      executor.valueUpdate(makeValueUpdate({ uuid: "first", storageName: "shared-storage" }));

      expect(delivered).toEqual(["first", "second"]);
      expect(executor.execScriptMap.get("first")?.valueUpdate).toHaveBeenCalledTimes(1);
      expect(executor.execScriptMap.get("second")?.valueUpdate).toHaveBeenCalledTimes(1);
      expect(executor.execScriptMap.get("third")?.valueUpdate).not.toHaveBeenCalled();
    });

    it("delivers only the UUID match when no shared storage overlaps", () => {
      const executor = new ScriptExecutor({} as Message, {} as Message);
      const first = vi.fn();
      const second = vi.fn();
      executor.execScriptMap.set("first", {
        scriptRes: { uuid: "first", metadata: { storagename: ["first-storage"] } },
        valueUpdate: first,
      } as never);
      executor.execScriptMap.set("second", {
        scriptRes: { uuid: "second", metadata: { storagename: ["second-storage"] } },
        valueUpdate: second,
      } as never);

      executor.valueUpdate(makeValueUpdate({ uuid: "second", storageName: "unknown-storage" }));

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });
  });
});
