import { describe, it, expect } from "vitest";
import { syncStatusVariant, syncLogHref } from "./syncStatus";
import { DEFAULT_CLOUD_SYNC_STATE, type CloudSyncState } from "@App/pkg/config/config";

const base = (
  over: Omit<Partial<CloudSyncState>, "counts"> & { counts?: Partial<CloudSyncState["counts"]> }
): CloudSyncState => ({
  ...DEFAULT_CLOUD_SYNC_STATE,
  ...over,
  counts: { ...DEFAULT_CLOUD_SYNC_STATE.counts, ...(over.counts || {}) },
});

describe("同步状态样式判定", () => {
  it("error 优先于同步中与覆盖/冲突", () => {
    expect(syncStatusVariant(base({ error: "x", syncing: true, counts: { overwrite: 2, conflict: 1 } }))).toBe("error");
  });

  it("同步中优先于覆盖/冲突", () => {
    expect(syncStatusVariant(base({ syncing: true, counts: { overwrite: 1 } }))).toBe("syncing");
  });

  it("有覆盖或冲突为 warning", () => {
    expect(syncStatusVariant(base({ counts: { conflict: 1 } }))).toBe("warning");
  });

  it("无异常为 idle", () => {
    expect(syncStatusVariant(base({ counts: { total: 5 } }))).toBe("idle");
  });

  it("warning 深链带 overwrite 过滤，其它只带 service", () => {
    expect(decodeURIComponent(syncLogHref("warning"))).toContain("overwrite");
    expect(decodeURIComponent(syncLogHref("idle"))).toContain("synchronize");
    expect(decodeURIComponent(syncLogHref("idle"))).not.toContain("overwrite");
  });
});
