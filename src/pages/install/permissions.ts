import type { SCMetadata } from "@App/app/repo/metadata";

export type PermissionRisk = "normal" | "warn" | "danger";

export type PermissionKind = "match" | "connect" | "grant" | "require";

export interface PermissionRow {
  kind: PermissionKind;
  risk: PermissionRisk;
  values: string[];
  /** values 中被判定为敏感的子集(如 GM_cookie),用于额外高亮 */
  sensitive: string[];
}

// 需要额外标记的敏感 GM 能力(可访问 Cookie 等隐私数据)
const SENSITIVE_GRANTS = new Set(["GM_cookie"]);
const RISK_ORDER: Record<PermissionRisk, number> = {
  danger: 0,
  warn: 1,
  normal: 2,
};

function sortDangerConnectFirst(values: string[]): string[] {
  return [...values].sort((a, b) => Number(b === "*") - Number(a === "*"));
}

function sortSensitiveGrantFirst(values: string[]): string[] {
  return [...values].sort((a, b) => Number(SENSITIVE_GRANTS.has(b)) - Number(SENSITIVE_GRANTS.has(a)));
}

/**
 * 把脚本元数据派生为「权限行」,作为安装页信任决策的核心呈现。
 * 高危/告警权限优先展示,同风险内保持基础类别顺序:运行网站 → 跨域访问 → GM 能力 → 外部资源。
 */
export function derivePermissions(metadata: SCMetadata): PermissionRow[] {
  const rows: PermissionRow[] = [];

  const match = [...(metadata.match || []), ...(metadata.include || [])];
  if (match.length) {
    rows.push({ kind: "match", risk: "normal", values: match, sensitive: [] });
  }

  const connect = metadata.connect || [];
  if (connect.length) {
    const values = sortDangerConnectFirst(connect);
    rows.push({
      kind: "connect",
      risk: values.includes("*") ? "danger" : "warn",
      values,
      sensitive: [],
    });
  }

  const grant = sortSensitiveGrantFirst((metadata.grant || []).filter((g) => g !== "none"));
  if (grant.length) {
    rows.push({
      kind: "grant",
      risk: "warn",
      values: grant,
      sensitive: grant.filter((g) => SENSITIVE_GRANTS.has(g)),
    });
  }

  const require = [...(metadata.require || []), ...(metadata.resource || [])];
  if (require.length) {
    rows.push({ kind: "require", risk: "normal", values: require, sensitive: [] });
  }

  return rows.sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk]);
}
