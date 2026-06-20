import "@Packages/chrome-extension-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageQueue } from "@Packages/message/message_queue";
import { SystemConfig } from "@App/pkg/config/config";
import { watchRegularUpdateCheck } from "./regular_updatecheck";

// chrome.alarms 在 chrome-extension-mock 中没有实现，这里手动桩
const alarmsCreate = vi.fn((_name: string, _info: unknown, cb?: () => void) => cb?.());
const alarmsClear = vi.fn();

beforeEach(() => {
  alarmsCreate.mockClear();
  alarmsClear.mockClear();
  // @ts-ignore - 测试环境注入 alarms 桩
  chrome.alarms = { create: alarmsCreate, clear: alarmsClear };
});

afterEach(() => {
  vi.restoreAllMocks();
});

// 等待 SystemConfig._set 内部的 storage.then() -> mq.publish 微任务完成
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("定期更新检查闹钟随配置变化重新设定", () => {
  it("当 check_script_update_cycle 变更时应重新设定 checkScriptUpdate 闹钟", async () => {
    const mq = new MessageQueue();
    const systemConfig = new SystemConfig(mq);
    // 初始周期：每天
    systemConfig.setCheckScriptUpdateCycle(86400);
    await flush();

    // 接线：监听配置变化并重新设定闹钟（生产代码会在 ScriptService.init() 中调用）
    watchRegularUpdateCheck(systemConfig);
    await flush();
    alarmsCreate.mockClear();

    // 用户把周期改为每周
    systemConfig.setCheckScriptUpdateCycle(604800);
    await flush();

    // 闹钟应被重新创建，且周期取整后为一周（604800s -> 10080min -> 10080）
    expect(alarmsCreate).toHaveBeenCalled();
    const [name, info] = alarmsCreate.mock.calls[alarmsCreate.mock.calls.length - 1];
    expect(name).toBe("checkScriptUpdate");
    expect((info as chrome.alarms.AlarmCreateInfo).periodInMinutes).toBe(10080);
  });

  it("当周期被改为 0（永不）时应清除 checkScriptUpdate 闹钟而非创建", async () => {
    const mq = new MessageQueue();
    const systemConfig = new SystemConfig(mq);
    systemConfig.setCheckScriptUpdateCycle(86400);
    await flush();

    watchRegularUpdateCheck(systemConfig);
    await flush();
    alarmsCreate.mockClear();
    alarmsClear.mockClear();

    systemConfig.setCheckScriptUpdateCycle(0);
    await flush();

    expect(alarmsClear).toHaveBeenCalledWith("checkScriptUpdate");
    expect(alarmsCreate).not.toHaveBeenCalled();
  });
});
