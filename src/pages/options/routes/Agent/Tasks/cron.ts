import { nextTimeInfo, nextTimeDisplay } from "@App/pkg/utils/cron";

// 复用仓库既有的 cron 解析工具，给出「下次运行」预览、合法性与可排序的时间戳。
export function nextRunText(crontab: string): { text: string; valid: boolean; at: number | null } {
  if (!crontab.trim()) return { text: "", valid: false, at: null };
  try {
    const info = nextTimeInfo(crontab); // 非法表达式会抛错
    return { text: nextTimeDisplay(crontab), valid: true, at: info.next.toMillis() };
  } catch {
    return { text: "", valid: false, at: null };
  }
}
