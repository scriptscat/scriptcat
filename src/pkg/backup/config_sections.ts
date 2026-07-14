import type { ConfigBundle } from "./config_bundle";

// 板块 id：应用设置细分 4 类 + Agent 3 类
export type SectionId = "appearance" | "update" | "editor" | "other" | "models" | "mcp" | "tasks";

export type ConfigSection = { id: SectionId; group: "app" | "agent"; count: number };

// 显式认领的 SystemConfig 键；未认领的落入 "other"（兜底，保证不漏键）
const APPEARANCE_KEYS = new Set([
  "menu_expand_num",
  "script_menu_display_type",
  "badge_number_type",
  "badge_background_color",
  "badge_text_color",
  "favicon_service",
]);
const UPDATE_KEYS = new Set([
  "check_script_update_cycle",
  "silence_update_script",
  "update_disable_script",
  "enable_auto_sync",
]);
const EDITOR_KEYS = new Set(["editor_config", "editor_preferences", "enable_eslint", "eslint_config"]);

type AppSectionId = "appearance" | "update" | "editor" | "other";
const APP_SECTION_ORDER: AppSectionId[] = ["appearance", "update", "editor", "other"];

function appSectionOf(key: string): AppSectionId {
  if (APPEARANCE_KEYS.has(key)) return "appearance";
  if (UPDATE_KEYS.has(key)) return "update";
  if (EDITOR_KEYS.has(key)) return "editor";
  return "other";
}

/** 备份中"存在的"板块（count>0）及计数，顺序固定：应用 4 类 → models → mcp → tasks */
export function listConfigSections(bundle: ConfigBundle): ConfigSection[] {
  const counts: Record<AppSectionId, number> = { appearance: 0, update: 0, editor: 0, other: 0 };
  for (const key of Object.keys(bundle.systemConfig || {})) {
    counts[appSectionOf(key)] += 1;
  }
  const sections: ConfigSection[] = [];
  for (const id of APP_SECTION_ORDER) {
    if (counts[id] > 0) sections.push({ id, group: "app", count: counts[id] });
  }
  const agent = bundle.agent;
  if (agent?.models?.length) sections.push({ id: "models", group: "agent", count: agent.models.length });
  if (agent?.mcp?.length) sections.push({ id: "mcp", group: "agent", count: agent.mcp.length });
  if (agent?.tasks?.length) sections.push({ id: "tasks", group: "agent", count: agent.tasks.length });
  return sections;
}

/** 依据选中的板块，产出只含这些板块数据的新 ConfigBundle（未选板块产出空 {}/[]） */
export function filterConfigBundle(bundle: ConfigBundle, selected: Set<SectionId>): ConfigBundle {
  const systemConfig: Record<string, any> = {};
  for (const [key, value] of Object.entries(bundle.systemConfig || {})) {
    if (selected.has(appSectionOf(key))) systemConfig[key] = value;
  }
  const models = selected.has("models");
  return {
    version: bundle.version,
    systemConfig,
    agent: {
      models: models ? bundle.agent.models : [],
      mcp: selected.has("mcp") ? bundle.agent.mcp : [],
      tasks: selected.has("tasks") ? bundle.agent.tasks : [],
      defaultModelId: models ? bundle.agent.defaultModelId : "",
      summaryModelId: models ? bundle.agent.summaryModelId : "",
    },
  };
}
