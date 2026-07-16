import { describe, it, expect } from "vitest";
import { syncStatusVariant, syncLogHref } from "./syncStatus";
import { DEFAULT_CLOUD_SYNC_STATE, type CloudSyncState } from "@App/pkg/config/config";
import enSettings from "@App/locales/en-US/settings.json";

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

  it("有文件同步失败时为 error，不能显示同步正常", () => {
    expect(syncStatusVariant(base({ counts: { failed: 1 } }))).toBe("error");
  });

  it("无异常为 idle", () => {
    expect(syncStatusVariant(base({ counts: { total: 5 } }))).toBe("idle");
  });

  it("只有覆盖时深链过滤 overwrite", () => {
    expect(decodeURIComponent(syncLogHref(base({ counts: { overwrite: 1 } })))).toContain("overwrite");
  });

  it("有冲突或失败时深链只过滤同步服务，不能隐藏对应日志", () => {
    const conflictHref = decodeURIComponent(syncLogHref(base({ counts: { overwrite: 1, conflict: 1 } })));
    const failedHref = decodeURIComponent(syncLogHref(base({ counts: { failed: 1 } })));

    expect(conflictHref).toContain("synchronize");
    expect(conflictHref).not.toContain("overwrite");
    expect(failedHref).toContain("synchronize");
    expect(failedHref).not.toContain("overwrite");
  });

  it("覆盖文案不应谎报固定方向", () => {
    expect(enSettings.notification.script_sync_overwrite_desc).toBe(
      "{{scriptNames}}: {{count}} script(s) were overwritten during sync. Open the logs to review the direction and details."
    );
    expect(enSettings.sync_state_attention_desc).toContain("overwritten during sync");
  });
});
