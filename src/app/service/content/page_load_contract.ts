import type { ScriptLoadInfo, TScriptInfo } from "@App/app/repo/scripts";

const PAGE_LOAD_SCRIPT_REQUIRED_KEYS = [
  "uuid",
  "name",
  "namespace",
  "metadata",
  "createtime",
  "checktime",
  "code",
  "value",
  "flag",
  "resource",
  "metadataStr",
  "userConfigStr",
] as const;

const PAGE_LOAD_SCRIPT_OPTIONAL_KEYS = [
  "author",
  "checkUpdate",
  "checkUpdateUrl",
  "downloadUrl",
  "config",
  "updatetime",
  "requireCssResource",
  "userConfig",
  "scriptUrlPatterns",
] as const;

type PageLoadScriptRequiredKey = (typeof PAGE_LOAD_SCRIPT_REQUIRED_KEYS)[number];
type PageLoadScriptOptionalKey = (typeof PAGE_LOAD_SCRIPT_OPTIONAL_KEYS)[number];

export type PageLoadScriptInfo = Pick<TScriptInfo, PageLoadScriptRequiredKey> &
  Partial<Pick<TScriptInfo, PageLoadScriptOptionalKey>>;

type PageLoadScriptFieldOverrides = Pick<
  TScriptInfo,
  "scriptRevision" | "metadata" | "value" | "config" | "resource" | "requireCssResource" | "code"
>;

/**
 * Projects the trusted service-worker ScriptLoadInfo onto the pageLoad wire contract.
 * Internal producer fields are opt-in: adding a field to ScriptLoadInfo cannot expose it to the page bridge by spread.
 * Fields that must be sanitized or derived (metadata, value, config, scriptRevision, ...) arrive as overrides.
 */
export const pickPageLoadScriptFields = (
  source: ScriptLoadInfo,
  overrides: PageLoadScriptFieldOverrides
): PageLoadScriptInfo => {
  const scriptInfo: Record<string, unknown> = {};
  const sourceRecord = source as unknown as Record<string, unknown>;
  for (const key of [...PAGE_LOAD_SCRIPT_REQUIRED_KEYS, ...PAGE_LOAD_SCRIPT_OPTIONAL_KEYS]) {
    if (Object.hasOwn(sourceRecord, key)) scriptInfo[key] = sourceRecord[key];
  }
  // 未定义的覆盖值视为缺省，不写入键，与按 own key 拷贝的白名单保持一致（如 config）。
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) scriptInfo[key] = value;
  }
  return scriptInfo as PageLoadScriptInfo;
};
