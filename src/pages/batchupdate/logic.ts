import type { SCMetadata } from "@App/app/repo/scripts";
import { i18nName } from "@App/locales/locales";
import type { TBatchUpdateRecord, TBatchUpdateRecordObject } from "@App/app/service/service_worker/types";

export type UpdateRisk = "major" | "noticeable" | "tiny";

export interface UpdateItem {
  uuid: string;
  name: string;
  enabled: boolean;
  oldVersion: string;
  newVersion: string;
  similarity: number;
  risk: UpdateRisk;
  withNewConnect: boolean;
  /** 新版本相比旧版本新增的 @connect 域名 */
  newConnects: string[];
  source: string;
  /** 脚本图标 URL（@icon / @iconURL / @icon64 / @icon64URL），无则为空串 */
  iconUrl: string;
  ignored: boolean;
  /** 该更新是否命中当前站点（来自 URL 的 ?site= 参数），命中者在列表中优先靠前 */
  siteMatch: boolean;
}

/** 从 metadata 提取脚本图标 URL（与脚本列表 ScriptIcon 取值规则一致） */
function pickIconUrl(metadata: SCMetadata): string {
  const [url] = metadata.icon || metadata.iconurl || metadata.icon64 || metadata.icon64url || [];
  return url || "";
}

/** 计算新版本相比旧版本新增的连接域名（旧的里没有的） */
function diffConnects(oldConnects: string[] | undefined, newConnects: string[] | undefined): string[] {
  const old = new Set(oldConnects || []);
  return (newConnects || []).filter((c) => !old.has(c));
}

export function riskLevel(similarity: number): UpdateRisk {
  if (similarity < 0.75) return "major";
  if (similarity < 0.95) return "noticeable";
  return "tiny";
}

export function getSource(record: TBatchUpdateRecord): string {
  if (!record.checkUpdate) return "";
  if (record.script.originDomain) return record.script.originDomain;
  if (!record.script.downloadUrl) return "";
  try {
    return new URL(record.script.downloadUrl).hostname;
  } catch {
    return "";
  }
}

export function toUpdateItem(record: TBatchUpdateRecord, site?: string): UpdateItem | null {
  if (!record.checkUpdate) return null;

  const oldVersion = record.script.metadata.version?.[0] ?? "";
  const newVersion = record.newMeta.version?.[0] ?? "";

  return {
    uuid: record.uuid,
    name: i18nName(record.script),
    enabled: record.script.status === 1,
    oldVersion,
    newVersion,
    similarity: record.codeSimilarity,
    risk: riskLevel(record.codeSimilarity),
    withNewConnect: record.withNewConnect,
    newConnects: diffConnects(record.script.metadata.connect, record.newMeta.connect),
    source: getSource(record),
    iconUrl: pickIconUrl(record.script.metadata),
    ignored: record.script.ignoreVersion === newVersion,
    siteMatch: !!site && record.sites.includes(site),
  };
}

/**
 * 将记录分组为待更新 / 已忽略。
 * 传入 site（当前网址，来自 ?site= 参数）时，命中该站点的待更新项排到列表最前
 * （命中/未命中各自保持原有相对顺序），便于用户优先处理正在访问站点的脚本更新。
 */
export function categorize(
  records: TBatchUpdateRecord[],
  site?: string
): {
  updates: UpdateItem[];
  ignored: UpdateItem[];
} {
  const updates: UpdateItem[] = [];
  const ignored: UpdateItem[] = [];

  for (const record of records) {
    const item = toUpdateItem(record, site);
    if (!item) continue;
    if (item.ignored) {
      ignored.push(item);
    } else {
      updates.push(item);
    }
  }

  if (site) {
    // 稳定排序：命中站点的排前，未命中的排后，组内相对顺序不变
    updates.sort((a, b) => Number(b.siteMatch) - Number(a.siteMatch));
  }

  return { updates, ignored };
}

export async function assembleRecord(
  fetchChunk: (index: number) => Promise<{ chunk: string; ended: boolean }>
): Promise<TBatchUpdateRecordObject | null> {
  let text = "";

  for (let index = 0; ; index += 1) {
    const { chunk, ended } = await fetchChunk(index);
    text += chunk;
    if (ended) break;
  }

  if (!text) return null;
  return JSON.parse(text) as TBatchUpdateRecordObject;
}
