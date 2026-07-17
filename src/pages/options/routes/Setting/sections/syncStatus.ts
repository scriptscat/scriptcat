import { type CloudSyncState } from "@App/pkg/config/config";

export type SyncStatusVariant = "idle" | "syncing" | "warning" | "error";

// 状态优先级：失败(error) > 同步中 > 上轮文件失败 > 有冲突(暂停) > 正常。
// SW 起始写只清 error 不清 counts：重试进行中不能被旧 counts.failed 压成"失败已暂停"。
// 覆盖(overwrite)不进入警示：覆盖是已发生、无需用户处理的审计信息，仅在 idle 态以信息行 + 日志深链呈现。
export function syncStatusVariant(state: CloudSyncState): SyncStatusVariant {
  if (state.error) return "error";
  if (state.syncing) return "syncing";
  if (state.counts.failed > 0) return "error";
  if (state.counts.conflict > 0) return "warning";
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
