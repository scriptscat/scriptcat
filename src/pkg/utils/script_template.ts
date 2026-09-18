import normalTpl from "@App/template/normal.tpl";
import crontabTpl from "@App/template/crontab.tpl";
import backgroundTpl from "@App/template/background.tpl";
import { SCRIPT_TYPE_BACKGROUND, SCRIPT_TYPE_CRONTAB, SCRIPT_TYPE_NORMAL } from "@App/app/repo/scripts";
import type { SCRIPT_TYPE } from "@App/app/repo/scripts";
import { t as i18n_t } from "@App/locales/locales";
import { dayFormat } from "./day_format";
import { parseScriptFromCode } from "./script";

export const SCRIPT_TEMPLATE_TYPES = ["normal", "background", "crontab"] as const;

export type ScriptTemplateType = (typeof SCRIPT_TEMPLATE_TYPES)[number];

/** 用户在设置里覆写的模板；未覆写的类型回落到内置默认模板 */
export type ScriptTemplateOverrides = Partial<Record<ScriptTemplateType, string>>;

export const DEFAULT_SCRIPT_TEMPLATES: Record<ScriptTemplateType, string> = {
  normal: normalTpl,
  background: backgroundTpl,
  crontab: crontabTpl,
};

const TEMPLATE_SCRIPT_TYPE: Record<ScriptTemplateType, SCRIPT_TYPE> = {
  normal: SCRIPT_TYPE_NORMAL,
  background: SCRIPT_TYPE_BACKGROUND,
  crontab: SCRIPT_TYPE_CRONTAB,
};

/** 无法从活动标签页推断时的 @match 取值 */
export const DEFAULT_TEMPLATE_MATCH = "https://*/*";

export type ScriptTemplateVars = {
  name: string;
  match: string;
  icon: string;
  domain: string;
  title: string;
  date: Date;
};

const PLACEHOLDER = /\{\{(\w+)(?::([^}]+))?\}\}/g;

function resolveVar(key: string, format: string | undefined, vars: ScriptTemplateVars): string | undefined {
  switch (key) {
    case "name":
      return vars.name;
    case "match":
      return vars.match;
    case "icon":
      return vars.icon;
    case "domain":
      return vars.domain;
    case "title":
      return vars.title;
    case "date":
      return dayFormat(vars.date, format || "YYYY-MM-DD");
    default:
      return undefined;
  }
}

/**
 * 用新建脚本时的上下文渲染模板。
 * 取值为空的变量会连同所在行一起删除，避免留下 `// @icon` 这类空指令；
 * 未识别的占位符原样保留，以免吃掉脚本代码里本来就有的 `{{...}}`。
 */
export function renderScriptTemplate(tpl: string, vars: ScriptTemplateVars): string {
  const lines: string[] = [];
  for (const line of tpl.split("\n")) {
    let dropLine = false;
    const rendered = line.replace(PLACEHOLDER, (raw, key: string, format?: string) => {
      const value = resolveVar(key, format, vars);
      if (value === undefined) return raw;
      if (value === "") {
        dropLine = true;
        return "";
      }
      return value;
    });
    if (!dropLine) lines.push(rendered);
  }
  return lines.join("\n");
}

export function resolveScriptTemplate(
  overrides: ScriptTemplateOverrides | undefined,
  type: ScriptTemplateType
): string {
  const custom = overrides?.[type];
  return custom?.trim() ? custom : DEFAULT_SCRIPT_TEMPLATES[type];
}

/**
 * 校验模板能否生成对应类型的脚本，返回错误信息；通过则返回 null。
 * 按「没有活动标签页」渲染后再校验：这是从设置页新建脚本时的真实上下文，
 * 也是页面相关变量全为空的最差情形。
 */
export function validateScriptTemplate(type: ScriptTemplateType, tpl: string): string | null {
  const code = renderScriptTemplate(tpl, {
    name: "New Userscript",
    match: DEFAULT_TEMPLATE_MATCH,
    icon: "",
    domain: "",
    title: "",
    date: new Date(),
  });
  let scriptType: SCRIPT_TYPE;
  try {
    scriptType = parseScriptFromCode(code, "").type;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  if (scriptType === TEMPLATE_SCRIPT_TYPE[type]) return null;
  if (type === "normal") {
    return i18n_t("settings:script_template_error_normal_directive");
  }
  return i18n_t("settings:script_template_error_missing_directive", {
    directive: type === "background" ? "@background" : "@crontab",
  });
}
