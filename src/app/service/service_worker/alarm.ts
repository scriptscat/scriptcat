import { sleep } from "@App/pkg/utils/utils";

/**
 * @description Alarm 回调执行时的参数对象。
 * @property {chrome.alarms.Alarm} alarm 触发的 alarm 对象。
 * @property {boolean} isFlushed 是否为补偿执行（例如设备休眠或 SW 重启后延迟触发）。
 * @property {number} triggeredAt 实际触发的时间戳（毫秒）。
 */
export type AlarmExecuteArgs = {
  alarm: chrome.alarms.Alarm;
  isFlushed: boolean;
  triggeredAt: number;
};

const alarmCallbackStore = {} as Record<string, (arg: AlarmExecuteArgs) => any>;
let started = false;

/**
 * @function mightCreatePeriodicAlarm
 * @description 创建（或复用）一个周期性执行的 Chrome Alarm。
 * 如果同名 alarm 不存在或周期不同，则会重新创建。
 *
 * @param {string} alarmName Alarm 名称。
 * @param {chrome.alarms.AlarmCreateInfo} alarmInfo Alarm 创建配置。
 * @returns {Promise<{ justCreated: boolean }>} 返回对象标识该 Alarm 是否是新创建的。
 *
 * @example
 * await mightCreatePeriodicAlarm("DataSync", { periodInMinutes: 10 });
 */
export const mightCreatePeriodicAlarm = (
  alarmName: string,
  alarmInfo: chrome.alarms.AlarmCreateInfo
): Promise<{ justCreated: boolean }> => {
  if (!alarmName || !alarmInfo?.periodInMinutes) throw new Error("Invalid Arguments for mightCreatePeriodicAlarm");
  // 用于创建周期性执行的 Alarm
  return new Promise((resolve) => {
    chrome.alarms.get(alarmName, (alarm) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.alarms.get:", lastError);
        // 忽略错误
        alarm = undefined;
      }

      // 如果 alarm 不存在或周期不同，则创建/更新 alarm
      if (!alarm || alarm.periodInMinutes !== alarmInfo.periodInMinutes) {
        chrome.alarms.create(alarmName, alarmInfo, () => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            console.error("chrome.runtime.lastError in chrome.alarms.create:", lastError);
            console.error("Chrome alarm 无法创建，请检查是否达到数量上限。");
          }
          resolve({ justCreated: true }); // 新创建的 Alarm 将根据 delayInMinutes 或 when 进行首次触发
        });
        return;
      }
      resolve({ justCreated: false }); // Alarm 未被重置，继续沿用现有调度（沿用其最近一次触发时间为基准的计划）
    });
  });
};

/**
 * @function monitorPeriodicAlarm
 * @description 监听所有已注册的 Chrome Alarm，并在触发时执行回调。
 * 同时负责在 Service Worker 重启后检查并补偿未执行的回调任务。
 *
 * @returns {Promise<void>}
 *
 * @example
 * await monitorPeriodicAlarm();
 */
export const monitorPeriodicAlarm = async () => {
  if (started) throw new Error("monitorPeriodicAlarm cannot be called twice.");
  started = true;
  const execute = (arg: AlarmExecuteArgs) => {
    const { alarm } = arg;
    const alarmCallback = alarmCallbackStore[alarm.name];
    if (alarmCallback && alarm.periodInMinutes) {
      // 将当前执行参数存入 storage.local：
      // 1) 防止回调等待期间浏览器关闭导致未执行；
      // 2) 支持 SW 重启或浏览器重新打开后补偿执行。
      const setPromise = chrome.storage.local.set({ [`AlarmPending:${alarm.name}`]: arg });
      setPromise
        .then(() => alarmCallback(arg))
        .catch(console.warn) // 避免回调出错中断执行链
        .then(() => {
          // 回调执行完毕，移除对应的存储记录
          chrome.storage.local.remove(`AlarmPending:${alarm.name}`);
        });
    }
  };

  // 在 SW 启动时注册，避免漏跑 Alarm
  const delayPromise = sleep(100); // 避免 SW 重启时回调尚未完成注册；延迟 100ms 在宏任务阶段触发
  chrome.alarms.onAlarm.addListener((alarm: chrome.alarms.Alarm) => {
    const lastError = chrome.runtime.lastError;
    if (lastError) {
      console.error("chrome.runtime.lastError in chrome.alarms.onAlarm:", lastError);
      // 非预期的 API 异常，停止处理
      return;
    }
    alarm = { ...alarm }; // 拷贝为普通对象，避免引用导致潜在内存泄漏 & storage 序列化問題

    // Chrome alarm 的触发精度约为 30 秒（新版）/ 1 分钟（旧版）
    // 若触发与计划时间相差 ≥ 65 秒，视为休眠/唤醒或 SW 重启等情况
    const triggeredAt = Date.now();
    const isFlushed = triggeredAt - alarm.scheduledTime >= 65_000;

    // 使用 delayPromise 确保 SW 重启时回调已准备好
    delayPromise.then(() => {
      execute({ alarm, isFlushed, triggeredAt });
    });
  });

  // SW 重启时检查是否有未执行的回调
  try {
    const store = await chrome.storage.local.get();
    const keys = Object.keys(store).filter((key) => key.startsWith("AlarmPending:"));
    if (keys.length > 0) {
      await sleep(3000); // 等待 onAlarm 监听器稳定（3 秒）
      const storeNew = await chrome.storage.local.get();
      const triggeredAt = Date.now();
      for (const key of keys) {
        // 检查上次 SW 启动时 alarmCallback 是否未成功执行
        if (storeNew[key] && store[key] && storeNew[key].triggeredAt === store[key].triggeredAt) {
          // 未成功执行则手动补偿执行
          const arg = storeNew[key] as AlarmExecuteArgs;
          arg.triggeredAt = triggeredAt;
          execute(arg);
        }
      }
    }
  } catch (e) {
    console.error(e);
  }
};

/**
 * @function setPeriodicAlarmCallback
 * @description 为指定 Alarm 注册回调函数，当 Alarm 触发时自动执行对应回调。
 *
 * @param {string} alarmName Alarm 名称。
 * @param {(arg: AlarmExecuteArgs) => any} callback Alarm 触发时执行的回调函数。
 *
 * @example
 * setPeriodicAlarmCallback("DataSync", ({ alarm, isFlushed }) => {
 *   console.log("Alarm 触发:", alarm.name, "是否补偿执行:", isFlushed);
 * });
 */
export const setPeriodicAlarmCallback = (alarmName: string, callback: (arg: AlarmExecuteArgs) => any) => {
  // 请在SW启用后100ms内设置
  alarmCallbackStore[alarmName] = callback;
};
