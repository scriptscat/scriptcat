import { describe, expect, it } from "vitest";
import type { ConfigBundle } from "./config_bundle";
import { filterConfigBundle, listConfigSections } from "./config_sections";

function mkBundle(p: Partial<ConfigBundle> = {}): ConfigBundle {
  return {
    version: 1,
    systemConfig: {},
    agent: { models: [], mcp: [], tasks: [], defaultModelId: "", summaryModelId: "" },
    ...p,
  };
}

describe("config_sections 板块划分", () => {
  it("按已知键归类到 appearance/update/editor,其余落 other,并计数", () => {
    const bundle = mkBundle({
      systemConfig: {
        menu_expand_num: 5,
        favicon_service: "scriptcat", // appearance ×2
        enable_auto_sync: true, // update ×1
        eslint_config: "{}", // editor ×1
        blacklist: "x", // other
        log_clean_cycle: 7, // other ×2
      },
    });
    expect(listConfigSections(bundle)).toEqual([
      { id: "appearance", group: "app", count: 2 },
      { id: "update", group: "app", count: 1 },
      { id: "editor", group: "app", count: 1 },
      { id: "other", group: "app", count: 2 },
    ]);
  });

  it("空 systemConfig 与空 agent 时返回空数组", () => {
    expect(listConfigSections(mkBundle())).toEqual([]);
  });

  it("agent 板块仅在对应数组非空时出现,计数为数组长度", () => {
    const bundle = mkBundle({
      agent: {
        models: [{ id: "m1" } as any, { id: "m2" } as any],
        mcp: [],
        tasks: [{ id: "t1" } as any],
        defaultModelId: "m1",
        summaryModelId: "m2",
      },
    });
    expect(listConfigSections(bundle)).toEqual([
      { id: "models", group: "agent", count: 2 },
      { id: "tasks", group: "agent", count: 1 },
    ]);
  });

  it("filterConfigBundle 只保留选中板块的 systemConfig 键", () => {
    const bundle = mkBundle({ systemConfig: { menu_expand_num: 5, eslint_config: "{}", blacklist: "x" } });
    const out = filterConfigBundle(bundle, new Set(["appearance"]));
    expect(out.systemConfig).toEqual({ menu_expand_num: 5 });
  });

  it("filterConfigBundle 选中 models 才带出 models 与默认/摘要模型 id", () => {
    const bundle = mkBundle({
      agent: {
        models: [{ id: "m1" } as any],
        mcp: [{ id: "s1" } as any],
        tasks: [],
        defaultModelId: "m1",
        summaryModelId: "m1",
      },
    });
    const withModels = filterConfigBundle(bundle, new Set(["models"]));
    expect(withModels.agent.models).toHaveLength(1);
    expect(withModels.agent.defaultModelId).toBe("m1");
    expect(withModels.agent.mcp).toEqual([]);

    const withoutModels = filterConfigBundle(bundle, new Set(["mcp"]));
    expect(withoutModels.agent.models).toEqual([]);
    expect(withoutModels.agent.defaultModelId).toBe("");
    expect(withoutModels.agent.mcp).toHaveLength(1);
  });
});
