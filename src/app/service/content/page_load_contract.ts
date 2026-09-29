import type { ScriptLoadInfo, TScriptInfo } from "@App/app/repo/scripts";

export const PAGE_LOAD_SCRIPT_REQUIRED_KEYS = [
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

export const PAGE_LOAD_SCRIPT_OPTIONAL_KEYS = [
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

const PAGE_LOAD_SCRIPT_ALLOWED_KEYS = new Set<string>([
  ...PAGE_LOAD_SCRIPT_REQUIRED_KEYS,
  ...PAGE_LOAD_SCRIPT_OPTIONAL_KEYS,
]);

type PageLoadScriptFieldOverrides = Pick<TScriptInfo, "resource" | "requireCssResource" | "code">;

/**
 * Verifies only the pageLoad DTO top-level key contract.
 *
 * This is intentionally a boolean shape check rather than a TypeScript type guard: it prevents producer/consumer
 * field drift, but it does not claim that unknown cross-context values have been fully validated as TScriptInfo.
 */
export const hasValidPageLoadScriptShape = (value: unknown): boolean => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    PAGE_LOAD_SCRIPT_REQUIRED_KEYS.every((key) => Object.hasOwn(record, key)) &&
    Object.keys(record).every((key) => PAGE_LOAD_SCRIPT_ALLOWED_KEYS.has(key))
  );
};

/**
 * Projects the trusted service-worker ScriptLoadInfo onto the pageLoad wire contract.
 * Internal producer fields are opt-in: adding a field to ScriptLoadInfo cannot expose it to the page bridge by spread.
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
  scriptInfo.resource = overrides.resource;
  scriptInfo.requireCssResource = overrides.requireCssResource;
  scriptInfo.code = overrides.code;
  return scriptInfo as PageLoadScriptInfo;
};
