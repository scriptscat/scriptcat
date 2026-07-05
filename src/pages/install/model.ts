import type { SCMetadata } from "@App/app/repo/metadata";

export type VersionDisplay =
  | { kind: "install"; version: string }
  | { kind: "update"; oldVersion: string; newVersion: string; changed: boolean };

/**
 * 派生版本徽章展示数据。
 * - 全新安装(无旧版本):单枚版本。
 * - 更新(有旧版本):旧 → 新,并标记版本号是否变化。
 */
export function deriveVersion(newVersion: string | undefined, oldVersion: string | null): VersionDisplay {
  const next = newVersion || "";
  if (oldVersion === null) {
    return { kind: "install", version: next };
  }
  return { kind: "update", oldVersion, newVersion: next, changed: next !== oldVersion };
}

// 已知反特性类型(与 v1.4 antifeatures 映射一致)
const ANTIFEATURE_TYPES = ["referral-link", "ads", "payment", "miner", "membership", "tracking"] as const;

export type AntifeatureType = (typeof ANTIFEATURE_TYPES)[number];

const ANTIFEATURE_SET = new Set<string>(ANTIFEATURE_TYPES);

/**
 * 从 @antifeature 标签派生已知反特性类型(取首个空格前的 token,忽略未知类型)。
 */
export function deriveAntifeatures(metadata: SCMetadata): AntifeatureType[] {
  const list: AntifeatureType[] = [];
  for (const entry of metadata.antifeature || []) {
    const type = entry.split(" ")[0];
    if (ANTIFEATURE_SET.has(type)) {
      list.push(type as AntifeatureType);
    }
  }
  return list;
}

export type DiffStat = { added: number; removed: number };

/**
 * 派生代码更新的增删行统计(按行多重集差):
 * removed = 旧代码中未被新代码匹配的行数,added = 新代码中未被旧代码匹配的行数。
 * 改一行计为一增一删(与 git --numstat 语义一致),用于代码卡头的 +N −M 徽章。
 */
export function deriveDiffStat(oldCode: string, newCode: string): DiffStat {
  const freq = (code: string) => {
    const m = new Map<string, number>();
    for (const line of code.split("\n")) m.set(line, (m.get(line) || 0) + 1);
    return m;
  };
  const oldFreq = freq(oldCode);
  const newFreq = freq(newCode);
  let added = 0;
  let removed = 0;
  for (const [line, n] of newFreq) added += Math.max(0, n - (oldFreq.get(line) || 0));
  for (const [line, n] of oldFreq) removed += Math.max(0, n - (newFreq.get(line) || 0));
  return { added, removed };
}

export type ScheduleInfo = { kind: "cron"; expression: string } | { kind: "background" } | null;

/**
 * 分类脚本的运行方式:定时(cron)优先,其次纯后台,否则普通页面脚本(null)。
 */
export function deriveScheduleInfo(metadata: SCMetadata): ScheduleInfo {
  if (metadata.crontab?.length) {
    return { kind: "cron", expression: metadata.crontab[0] };
  }
  if (metadata.background) {
    return { kind: "background" };
  }
  return null;
}
