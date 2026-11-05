import type { SCMetadata } from "@App/app/repo/metadata";
import type { TExtensionEnv } from "../extension/extension_env";
import { getISOWeek } from "@App/pkg/utils/utils";

/**
 * 后台/定时脚本的 @run-in 是否允许它在该扩展环境的 sandbox 中运行。sandbox 据此跳过不匹配的运行，
 * 外部接入 scripts.run 据此在触发前拒绝，两处必须同一判断。拿不到隐身状态时不过滤（fail-open），
 * 避免静默丢失任务。
 */
export function backgroundRunInAllowed(metadata: SCMetadata | undefined, extensionEnv: TExtensionEnv | undefined) {
  const runIn = metadata?.["run-in"]?.[0];
  const inIncognitoContext = extensionEnv?.inIncognitoContext;
  // Firefox spanning 只有一个共享 event page / sandbox，没有按普通窗口与隐身窗口拆分的后台环境。
  // 因此后台/定时脚本只能运行一次；tab 专属的 run-in 值在该共享环境中不做伪隔离。
  const hasPerContextBackground = extensionEnv?.incognitoMode !== "spanning";
  if (hasPerContextBackground && runIn && runIn !== "all" && typeof inIncognitoContext === "boolean") {
    return runIn === (inIncognitoContext ? "incognito-tabs" : "normal-tabs");
  }
  return true;
}

const utime_1min = 60 * 1000;
const utime_1hr = 60 * 60 * 1000;
const utime_1day = 24 * 60 * 60 * 1000;

/**
 * cron 表达式 once 字段所在的周期内是否已运行过（应跳过本次触发）。oncePos 是 once 在 6 位 cron 中的位置
 * （见 extractCronExpr），小于 1 表示没有 once。以 lastruntime 计，它在运行开始时就写入，所以失败的运行也算。
 * 时间差上限用来区分「同一周期」与「隔了一个更大周期后同名单位又相同」。
 */
export function isOnceRunDone(oncePos: number, lastruntime: number | undefined, now: Date): boolean {
  if (oncePos < 1 || !lastruntime) return false;
  const last = new Date(lastruntime);
  const timeDiff = now.getTime() - last.getTime();
  switch (oncePos) {
    case 1:
      return timeDiff < 2 * utime_1min && last.getMinutes() === now.getMinutes();
    case 2:
      return timeDiff < 2 * utime_1hr && last.getHours() === now.getHours();
    case 3:
      return timeDiff < 2 * utime_1day && last.getDay() === now.getDay();
    case 4:
      return timeDiff < 62 * utime_1day && last.getMonth() === now.getMonth();
    case 5:
      return timeDiff < 14 * utime_1day && getISOWeek(last) === getISOWeek(now);
    default:
      return false;
  }
}
