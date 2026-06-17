import type { ConfirmParam } from "@App/app/service/service_worker/permission_verify";

// 授权时长
export type Duration = "once" | "temporary" | "permanent";

/**
 * 时长 × 是否应用于全部（通配）→ UserConfirm.type
 * type 含义：1 允许一次 / 2 临时全部 / 3 临时此 / 4 永久全部 / 5 永久此
 */
export function resolveConfirmType(duration: Duration, applyToAll: boolean): number {
  switch (duration) {
    case "once":
      return 1;
    case "temporary":
      return applyToAll ? 2 : 3;
    case "permanent":
      return applyToAll ? 4 : 5;
  }
}

/**
 * 可选的授权时长。persistentOnly 模式下「临时」不会被缓存（等同一次性），故隐藏。
 */
export function availableDurations(confirm: ConfirmParam): Duration[] {
  return confirm.persistentOnly ? ["once", "permanent"] : ["once", "temporary", "permanent"];
}

/**
 * 「应用到所有域名（通配）」开关是否可见：权限支持通配，且同类等待确认请求超过 2 个时才解锁。
 */
export function canApplyToAll(confirm: ConfirmParam, likeNum: number): boolean {
  return !!confirm.wildcard && likeNum > 2;
}

/** 是否为站点访问权限（单按钮变体）。 */
export function isSiteAccess(confirm: ConfirmParam): boolean {
  return confirm.permission === "extension-site-access";
}

/** 是否为高敏感权限：展示顶部警示条提醒用户谨慎授权。 */
export function isHighSensitive(confirm: ConfirmParam): boolean {
  return confirm.permission === "cookie";
}
