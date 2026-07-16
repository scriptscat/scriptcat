import { type CloudSyncState } from "@App/pkg/config/config";

export type SyncStatusVariant = "idle" | "syncing" | "warning" | "error";

// 状态优先级：失败 > 同步中 > 有覆盖/冲突 > 正常
export function syncStatusVariant(state: CloudSyncState): SyncStatusVariant {
  if (state.error || state.counts.failed > 0) return "error";
  if (state.syncing) return "syncing";
  if (state.counts.overwrite > 0 || state.counts.conflict > 0) return "warning";
  return "idle";
}

// 「查看日志」深链：预过滤 service=synchronize；有覆盖时进一步落到 overwrite 行。
// 由 Logger 页 parseInitialQueries 解析（?query=<JSON [{key,condition,value}]>）。
export function syncLogHref(state: CloudSyncState): string {
  const query: { key: string; value: string }[] = [{ key: "service", value: "synchronize" }];
  if (state.counts.overwrite > 0 && state.counts.conflict === 0 && state.counts.failed === 0 && !state.error) {
    query.push({ key: "action", value: "overwrite" });
  }
  return `#/logs?query=${encodeURIComponent(JSON.stringify(query))}`;
}
