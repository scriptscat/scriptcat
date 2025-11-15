import { type SystemConfig } from "@App/pkg/config/config";
import { type ScriptService } from "./script";
import { type SubscribeService } from "./subscribe";

// 如果距离下次检查还有超过30秒，则使用计算的时间；否则使用默认延迟
const MIN_REMAINING_TIME_MS = 30000;
// Service Worker 启动后的默认延迟时间，给予足够的初始化时间
const DEFAULT_FIRST_CHECK_DELAY_MS = 6000;
// 允许在预定时间前最多65秒内触发检查（考虑 alarm 触发时间的不精确性）
const ALARM_TRIGGER_WINDOW_MS = 65000;
// Service Worker 启动后允许执行 alarm 的延迟时间
const ALLOW_CHECK_DELAY_MS = 3000;

export let allowRegularUpdateCheck = 0; // 避免SW启动时alarm触发

export const initRegularUpdateCheck = async (systemConfig: SystemConfig) => {
  // regularScriptUpdateCheck
  const [result, updateCycleSecond] = await Promise.all([
    chrome.storage.local.get(["checkupdate_script_lasttime"]),
    systemConfig.getCheckScriptUpdateCycle(), // check_script_update_cycle
  ]);
  if (updateCycleSecond === 0) return; // no regular update check
  const now = Date.now();
  let when = 0;
  const checkupdate_script_lasttime: number = result.checkupdate_script_lasttime || 0;
  // 有 checkupdate_script_lasttime 而且是单数值（上次的定时更新检查有完成）
  if (checkupdate_script_lasttime && (checkupdate_script_lasttime & 1) === 1) {
    const updateCycleMs = updateCycleSecond * 1000;
    const next = checkupdate_script_lasttime + updateCycleMs;
    if (next > now + MIN_REMAINING_TIME_MS) {
      when = next;
    }
  }
  when = when || now + DEFAULT_FIRST_CHECK_DELAY_MS; // 六秒后触发第一个alarm
  let targetPeriodInMinutes = Math.ceil(updateCycleSecond / 60); // 分钟
  targetPeriodInMinutes = Math.ceil(targetPeriodInMinutes / 5) * 5; // 5的倍数
  if (targetPeriodInMinutes < 15) targetPeriodInMinutes = 15; // 至少15分钟
  chrome.alarms.create(
    "checkScriptUpdate",
    {
      when,
      periodInMinutes: targetPeriodInMinutes,
    },
    () => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.alarms.create:", lastError);
        // Starting in Chrome 117, the number of active alarms is limited to 500. Once this limit is reached, chrome.alarms.create() will fail.
        console.error("Chrome alarm is unable to create. Please check whether limit is reached.");
      }
    }
  );
  allowRegularUpdateCheck = now + ALLOW_CHECK_DELAY_MS; // 可以触发alarm的更新程序了
};

const setCheckupdateScriptLasttime = async (t: number) => {
  try {
    // 试一下储存。储存不了也没所谓
    await chrome.storage.local.set({ checkupdate_script_lasttime: t });
  } catch (e: any) {
    console.error(e);
  }
};

export const onRegularUpdateCheckAlarm = async (
  systemConfig: SystemConfig,
  script: ScriptService,
  subscribe?: SubscribeService
) => {
  const now = Date.now();
  if (!allowRegularUpdateCheck || now < allowRegularUpdateCheck) return null; // 避免SW启动时alarm触发
  const [result, updateCycleSecond] = await Promise.all([
    chrome.storage.local.get(["checkupdate_script_lasttime"]),
    systemConfig.getCheckScriptUpdateCycle(), // check_script_update_cycle
  ]);
  if (updateCycleSecond === 0) return null; // no regular update check
  const checkupdate_script_lasttime: number = result.checkupdate_script_lasttime || 0;
  const targetWhen = checkupdate_script_lasttime + updateCycleSecond * 1000;
  if (targetWhen - ALARM_TRIGGER_WINDOW_MS > now) return null; // 已检查过了（alarm触发了）
  const storeTime = Math.floor(now / 2) * 2; // 双数
  await setCheckupdateScriptLasttime(storeTime); // 双数值：alarm触发了，但不知道有没有真的检查好（例如中途浏览器关了）
  const res = await script.checkScriptUpdate({ checkType: "system" });
  try {
    if (subscribe) {
      // 不论 checkScriptUpdate 成功与否，执行 checkSubscribeUpdate
      const checkDisableScript = await systemConfig.getUpdateDisableScript();
      await subscribe.checkSubscribeUpdate(updateCycleSecond, checkDisableScript);
    }
  } catch (e: any) {
    console.error(e);
  }
  await setCheckupdateScriptLasttime(storeTime + 1); // 单数值：alarm触发了，而且真的检查好
  return res;
};
