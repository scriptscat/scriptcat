import type { Subscribe } from "@App/app/repo/subscribe";
import type { SCMetadata } from "@App/app/repo/metadata";
import { SCRIPT_STATUS_ENABLE } from "@App/app/repo/scripts";
import type { ScriptBackupData, ScriptData, SubscribeData, ValueStorage } from "@App/pkg/backup/struct";
import { i18nName } from "@App/locales/locales";
import { overrideToSelfMetadata } from "@App/pkg/backup/self_metadata";

/** 单项导入的操作语义:新增 / 更新已存在项 / 解析失败 */
export type ImportOp = "add" | "update" | "error";

/** 脚本来源:外部链接(域名)、本地创建、或无来源 */
export type ImportSource = { kind: "url"; host: string; full: string } | { kind: "local" } | { kind: "none" };

/** 单个脚本的导入视图模型(由已 prepare 的 ScriptData 派生) */
export interface ScriptImportItem {
  /** React 列表稳定 key */
  id: string;
  /** 脚本 uuid;解析失败项为空串 */
  uuid: string;
  name: string;
  author: string;
  iconUrl: string;
  op: ImportOp;
  /** 更新态的旧版本;新增/失败为空串 */
  oldVersion: string;
  /** 新版本;失败为空串 */
  newVersion: string;
  source: ImportSource;
  /** 将一并恢复的本地数据(values)条数 */
  valueCount: number;
  /** 是否含 requires/resources 资源 */
  hasResources: boolean;
  /** 安装后是否启用 */
  enabled: boolean;
  /** 是否可勾选导入(解析失败项为 false) */
  importable: boolean;
  error?: string;
}

/** 已 prepare 的订阅中间结构(hooks 调 prepareSubscribeByCode 后产出,供纯转换使用) */
export interface PreparedSubscribe {
  data: SubscribeData;
  subscribe?: Subscribe;
  /** 是否已存在同 url 的订阅(用于判定新增/更新) */
  oldExists?: boolean;
  error?: string;
}

/** 单个订阅的导入视图模型(订阅无启用开关、无数据列,比脚本简化) */
export interface SubscribeImportItem {
  id: string;
  url: string;
  name: string;
  op: ImportOp;
  importable: boolean;
  error?: string;
}

/** 从 metadata 提取脚本图标 URL(与脚本列表/批量更新页取值规则一致) */
function pickIconUrl(metadata: SCMetadata): string {
  const [url] = metadata.icon || metadata.iconurl || metadata.icon64 || metadata.icon64url || [];
  return url || "";
}

/** 由 file_url 推导来源:空 → 本地创建;可解析 → 域名;否则原文兜底 */
export function deriveSource(fileUrl?: string): ImportSource {
  if (!fileUrl) return { kind: "local" };
  try {
    const host = new URL(fileUrl).hostname;
    if (host) return { kind: "url", host, full: fileUrl };
  } catch {
    // 落到下方兜底
  }
  return { kind: "url", host: fileUrl, full: fileUrl };
}

/**
 * 从备份项解出脚本自定义元数据 selfMetadata:
 * - SC 备份:直接用 options.selfMeta(无损)
 * - TM 备份:从 options.options.override.use_* + run_at/noframes 推导
 * - VM 备份:import.ts 解析时已预置为 options.selfMeta
 * 无自定义时返回 undefined。
 */
export function deriveSelfMetadata(item: ScriptData, scriptMetadata: SCMetadata): SCMetadata | undefined {
  const selfMeta = item.options?.selfMeta;
  if (selfMeta && Object.keys(selfMeta).length > 0) {
    return selfMeta;
  }
  const ov = item.options?.options;
  if (ov?.override) {
    const self = overrideToSelfMetadata(
      { ...ov.override, run_at: ov.run_at ?? null, noframes: ov.noframes ?? null },
      scriptMetadata
    );
    if (Object.keys(self).length > 0) return self;
  }
  return undefined;
}

/** 统计将恢复的本地数据条数 */
export function countValues(storage?: ValueStorage): number {
  return storage?.data ? Object.keys(storage.data).length : 0;
}

/** 备份是否含 requires / resources / requiresCss 资源 */
export function hasResources(data: ScriptBackupData): boolean {
  return (data.requires?.length ?? 0) > 0 || (data.resources?.length ?? 0) > 0 || (data.requiresCss?.length ?? 0) > 0;
}

export function toScriptImportItem(data: ScriptData, index: number): ScriptImportItem {
  const source = deriveSource(data.options?.meta.file_url);
  const valueCount = countValues(data.storage);
  const resources = hasResources(data);

  if (data.error || !data.script) {
    const metaName = data.options?.meta.name;
    return {
      id: data.options?.meta.sc_uuid || data.options?.meta.uuid || `err-${index}`,
      uuid: "",
      name: metaName || "",
      author: "",
      iconUrl: "",
      op: "error",
      oldVersion: "",
      newVersion: "",
      source,
      valueCount,
      hasResources: resources,
      enabled: false,
      importable: false,
      error: data.error,
    };
  }

  const s = data.script.script;
  return {
    id: s.uuid,
    uuid: s.uuid,
    name: i18nName(s),
    author: s.metadata.author?.[0] || "",
    iconUrl: pickIconUrl(s.metadata),
    op: data.script.oldScript ? "update" : "add",
    oldVersion: data.script.oldScript?.metadata.version?.[0] || "",
    newVersion: s.metadata.version?.[0] || "",
    source,
    valueCount,
    hasResources: resources,
    enabled: s.status === SCRIPT_STATUS_ENABLE,
    importable: true,
  };
}

export function toSubscribeImportItem(p: PreparedSubscribe, index: number): SubscribeImportItem {
  const meta = p.data.options?.meta;
  if (p.error || !p.subscribe) {
    return {
      id: meta?.url || `sub-err-${index}`,
      url: meta?.url || "",
      name: meta?.name || "",
      op: "error",
      importable: false,
      error: p.error,
    };
  }
  return {
    id: p.subscribe.url,
    url: p.subscribe.url,
    name: p.subscribe.name || meta?.name || "",
    op: p.oldExists ? "update" : "add",
    importable: true,
  };
}

/** 可导入脚本的 id 列表(供全选) */
export function importableScriptIds(items: ScriptImportItem[]): string[] {
  return items.filter((i) => i.importable).map((i) => i.id);
}

/** 可导入订阅的 id 列表(供全选) */
export function importableSubscribeIds(items: SubscribeImportItem[]): string[] {
  return items.filter((i) => i.importable).map((i) => i.id);
}

/** 按本地化名称排序(不可变,返回新数组) */
export function sortByName<T extends { name: string }>(items: T[]): T[] {
  return items.slice().sort((a, b) => a.name.localeCompare(b.name));
}

/** 汇总已勾选且可导入项:脚本数、订阅数、数据条数(用于完成屏 / 进度总数) */
export function summarize(
  scripts: ScriptImportItem[],
  subscribes: SubscribeImportItem[],
  selectedScripts: Set<string>,
  selectedSubscribes: Set<string>
): { scripts: number; subscribes: number; values: number } {
  const picked = scripts.filter((s) => s.importable && selectedScripts.has(s.id));
  return {
    scripts: picked.length,
    subscribes: subscribes.filter((s) => s.importable && selectedSubscribes.has(s.id)).length,
    values: picked.reduce((sum, s) => sum + s.valueCount, 0),
  };
}
