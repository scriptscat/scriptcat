import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@Packages/message/types";
import type { ScriptLoadInfo } from "../service_worker/types";
import type ExecScript from "./exec_script";
import type { TScriptInfo } from "@App/app/repo/scripts";
import { encodeRValue } from "@App/pkg/utils/message_value";
import { initEnvInfo, ScriptExecutor } from "./script_executor";
import type { ValueUpdateDataEncoded } from "./types";

const response = (uuid: string, id: string, value: string): ValueUpdateDataEncoded => ({
  id,
  valueChanges: [["key", encodeRValue(value), encodeRValue("previous")]],
  uuid,
  storageName: "shared",
  sender: { runFlag: "worker", tabId: -2 },
});

describe("ScriptExecutor value updates", () => {
  it("preserves interleaved updates from scripts sharing a storageName", () => {
    const executor = new ScriptExecutor({} as Message, {} as Message);
    const update = vi.fn();
    executor.execScriptMap.set("script-a", { valueUpdate: update } as unknown as ExecScript);
    executor.valueUpdate({
      storageName: "shared",
      storageChanges: [
        response("script-a", "a1", "a1"),
        response("script-b", "b1", "b1"),
        response("script-a", "a2", "a2"),
      ],
    });
    expect(update.mock.calls.map(([, uuid, responses]) => [uuid, responses[0].id])).toEqual([
      ["script-a", "a1"],
      ["script-b", "b1"],
      ["script-a", "a2"],
    ]);
  });
});

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

describe("ScriptExecutor resource execution", () => {
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
  afterEach(() => vi.restoreAllMocks());

  it("injects every resolved @require-css resource in declaration order", () => {
    const resource = (url: string, content: string) => ({
      url,
      content,
      base64: "",
      hash: { md5: "test", sha1: "test", sha256: "test", sha384: "test", sha512: "test" },
      type: "require-css" as const,
      link: {},
      contentType: "text/css",
      createtime: Date.now(),
    });
    const script = makeScript({
      metadata: { "require-css": [styleUrl, secondStyleUrl] },
      resource: {
        [secondStyleUrl]: resource(secondStyleUrl, "body { color: blue; }"),
        [styleUrl]: resource(styleUrl, "body { color: red; }"),
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
      requireCssResource: { [styleUrl]: { content: "body { color: green; }", contentType: "text/css" } },
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
