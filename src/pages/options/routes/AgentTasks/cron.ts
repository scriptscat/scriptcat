import { nextTimeInfo, nextTimeDisplay } from "@App/pkg/utils/cron";

// 复用仓库既有的 cron 解析工具，给出「下次运行」预览与合法性。
export function nextRunText(crontab: string): { text: string; valid: boolean } {
  if (!crontab.trim()) return { text: "", valid: false };
  try {
    nextTimeInfo(crontab); // 非法表达式会抛错
    return { text: nextTimeDisplay(crontab), valid: true };
  } catch {
    return { text: "", valid: false };
  }
}
