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

  it("有冲突为 warning", () => {
    expect(syncStatusVariant(base({ counts: { conflict: 1 } }))).toBe("warning");
  });

  it("仅有覆盖、无冲突无失败时为 idle（覆盖降级为信息级，不触发警示）", () => {
    // 覆盖是已发生、无需用户处理的审计信息，不应与冲突同级弹琥珀警示
    expect(syncStatusVariant(base({ counts: { overwrite: 5 } }))).toBe("idle");
  });

  it("有文件同步失败时为 error，不能显示同步正常", () => {
    expect(syncStatusVariant(base({ counts: { failed: 1 } }))).toBe("error");
  });

  it("上一轮有失败但重试进行中时应显示同步中，而非失败已暂停", () => {
    // SW 起始写只清 error 不清 counts：重试期间旧 counts.failed 不能把状态条压成"失败"
    expect(syncStatusVariant(base({ syncing: true, counts: { failed: 1 } }))).toBe("syncing");
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

  it("覆盖信息文案不谎报固定方向（只说发生覆盖，不断言本地/云端谁覆盖谁）", () => {
    // 覆盖方向随每个脚本而变，状态条信息行只能中性描述，不能硬编码单一方向
    expect(enSettings.sync_state_overwrite_info).toContain("overwritten during");
    expect(enSettings.sync_state_overwrite_info).not.toMatch(/\b(local|cloud|remote)\b/i);
  });

  it("警示文案只描述冲突已暂停，覆盖已降级不再出现在警示里", () => {
    expect(enSettings.sync_state_attention_desc).toContain("conflict");
    expect(enSettings.sync_state_attention_desc).not.toContain("overwritten");
  });
});
