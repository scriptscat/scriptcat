import { describe, expect, it } from "vitest";
import { parseConfigBundle, toBundleConfig } from "./config_bundle";

describe("config bundle", () => {
  it("toBundleConfig 排除本机相关键(cloud_sync/backup/cat_file_storage/language/vscode_url 等)", () => {
    expect(
      toBundleConfig({
        menu_expand_num: 5,
        language: "zh-CN",
        vscode_url: "ws://x",
        cloud_sync: { p: 1 },
        backup: { p: 2 },
        cat_file_storage: { p: 3 },
        enable_script: true,
      })
    ).toEqual({ menu_expand_num: 5 });
  });

  it("解析合法配置并保留默认模型与摘要模型选择", () => {
    const bundle = {
      version: 1,
      systemConfig: { menu_expand_num: 5 },
      agent: { models: [], mcp: [], tasks: [], defaultModelId: "m1", summaryModelId: "m2" },
    };
    expect(parseConfigBundle(bundle)).toEqual(bundle);
  });

  it("拒绝不支持的配置版本", () => {
    expect(() =>
      parseConfigBundle({
        version: 2,
        systemConfig: {},
        agent: { models: [], mcp: [], tasks: [], defaultModelId: "", summaryModelId: "" },
      })
    ).toThrow("Unsupported config bundle version: 2");
  });

  it("拒绝旧的 { sync, local } 嵌套结构", () => {
    expect(() =>
      parseConfigBundle({
        version: 1,
        systemConfig: { sync: {}, local: {} },
        agent: { models: [], mcp: [], tasks: [], defaultModelId: "", summaryModelId: "" },
      })
    ).toThrow("Invalid config bundle");
  });

  it("拒绝结构损坏的配置", () => {
    expect(() => parseConfigBundle({ version: 1, systemConfig: null, agent: {} })).toThrow("Invalid config bundle");
  });
});
