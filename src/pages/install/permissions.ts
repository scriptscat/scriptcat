import type { SCMetadata } from "@App/app/repo/metadata";

export type PermissionRisk = "normal" | "warn" | "danger";

export type PermissionKind = "match" | "connect" | "grant" | "require";

/** 相对已安装版本的取值增删；仅更新场景派生 */
export interface PermissionDiff {
  added: string[];
  removed: string[];
}

export interface PermissionRow {
  kind: PermissionKind;
  risk: PermissionRisk;
  values: string[];
  /** values 中被判定为敏感的子集(如 GM_cookie),用于额外高亮 */
  sensitive: string[];
  /** 更新场景才有;全新安装为 undefined,此时整行按「全部都是新的」呈现 */
  diff?: PermissionDiff;
}

// 需要额外标记的敏感 GM 能力(可访问 Cookie 等隐私数据)
const SENSITIVE_GRANTS = new Set(["GM_cookie"]);
const RISK_ORDER: Record<PermissionRisk, number> = {
  danger: 0,
  warn: 1,
  normal: 2,
};

// 基础类别顺序:运行网站 → 跨域访问 → GM 能力 → 外部资源
const KIND_ORDER: PermissionKind[] = ["match", "connect", "grant", "require"];

function sortDangerConnectFirst(values: string[]): string[] {
  return [...values].sort((a, b) => Number(b === "*") - Number(a === "*"));
}

function sortSensitiveGrantFirst(values: string[]): string[] {
  return [...values].sort((a, b) => Number(SENSITIVE_GRANTS.has(b)) - Number(SENSITIVE_GRANTS.has(a)));
}

/** 按类别摊平元数据中的权限取值,空类别保留为空数组以便与另一版本对齐比较 */
function collectValues(metadata: SCMetadata): Record<PermissionKind, string[]> {
  return {
    match: [...(metadata.match || []), ...(metadata.include || [])],
    connect: metadata.connect || [],
    grant: (metadata.grant || []).filter((g) => g !== "none"),
    require: [...(metadata.require || []), ...(metadata.resource || [])],
  };
}

/** 由单个类别的取值构造权限行,决定行内排序、风险与敏感项 */
function buildRow(kind: PermissionKind, values: string[]): PermissionRow {
  // 取值为空意味着该类别什么都不请求,无论原本属于哪一档都不再构成风险
  if (!values.length) {
    return { kind, risk: "normal", values: [], sensitive: [] };
  }
  switch (kind) {
    case "connect": {
      const sorted = sortDangerConnectFirst(values);
      return { kind, risk: sorted.includes("*") ? "danger" : "warn", values: sorted, sensitive: [] };
    }
    case "grant": {
      const sorted = sortSensitiveGrantFirst(values);
      return { kind, risk: "warn", values: sorted, sensitive: sorted.filter((g) => SENSITIVE_GRANTS.has(g)) };
    }
    default:
      return { kind, risk: "normal", values, sensitive: [] };
  }
}

/** 该行相对已安装版本是否发生了增删;全新安装(无 diff)恒为 false */
export const isPermissionChanged = (row: PermissionRow) =>
  !!row.diff && (row.diff.added.length > 0 || row.diff.removed.length > 0);

/**
 * 把脚本元数据派生为「权限行」,作为安装页信任决策的核心呈现。
 * 高危/告警权限优先展示,同风险内保持基础类别顺序。
 */
export function derivePermissions(metadata: SCMetadata): PermissionRow[] {
  const values = collectValues(metadata);
  return KIND_ORDER.filter((kind) => values[kind].length)
    .map((kind) => buildRow(kind, values[kind]))
    .sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk]);
}

/**
 * 以已安装脚本为基线派生权限行,逐取值标注新增与移除。
 * 排序键为「有变动 → 风险 → 基础类别顺序」:更新页首先要回答的是这次变了什么,
 * 未变动的高危项是用户上次安装时已经确认过的内容。
 * 某类别在新版本被清空但旧版本非空时仍然成行,否则「不再请求网络访问」这类变化会整行消失。
 */
export function derivePermissionDiff(oldMetadata: SCMetadata, newMetadata: SCMetadata): PermissionRow[] {
  const oldValues = collectValues(oldMetadata);
  const newValues = collectValues(newMetadata);
  const rows: PermissionRow[] = [];

  for (const kind of KIND_ORDER) {
    const next = newValues[kind];
    const prev = oldValues[kind];
    const nextSet = new Set(next);
    const prevSet = new Set(prev);
    const removed = prev.filter((v) => !nextSet.has(v));
    if (!next.length && !removed.length) continue;
    const row = buildRow(kind, next);
    row.diff = { added: row.values.filter((v) => !prevSet.has(v)), removed };
    rows.push(row);
  }

  return rows.sort(
    (a, b) => Number(isPermissionChanged(b)) - Number(isPermissionChanged(a)) || RISK_ORDER[a.risk] - RISK_ORDER[b.risk]
  );
}
