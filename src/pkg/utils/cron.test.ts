import { afterEach, describe, expect, it, vi } from "vitest";

import { createCronJob, getLocalUtcOffset, getLuxonDate, toUtcOffsetZone } from "./cron";

/**
 * 这些测试刻意不依赖真实机器的时区。
 *
 * 原因：
 * - 开发机、CI、Docker、服务器的本地时区可能不同
 * - Date#getTimezoneOffset() 的结果会受运行环境影响
 * - 如果测试直接依赖真实时区，容易出现“本地通过，CI 失败”的问题
 *
 * 所以这里统一使用 vi.spyOn(Date.prototype, 'getTimezoneOffset')
 * 固定模拟不同 UTC offset 场景。
 */
describe("cron-utils", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getLocalUtcOffset", () => {
    it("应该把 Date#getTimezoneOffset() 的符号反转成 cron / fixed offset 使用的方向", () => {
      /**
       * JavaScript Date#getTimezoneOffset() 的方向和 UTC offset 相反。
       *
       * 例如 UTC+8：
       * - Date#getTimezoneOffset() 返回 -480
       * - 我们需要的 UTC offset 是 480
       */
      vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(-480);

      expect(getLocalUtcOffset(new Date("2024-04-04T04:44:44Z"))).toBe(480);
    });

    it("应该正确处理 UTC-6 这种负时区", () => {
      /**
       * 例如 UTC-6：
       * - Date#getTimezoneOffset() 返回 360
       * - 我们需要的 UTC offset 是 -360
       */
      vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(360);

      expect(getLocalUtcOffset(new Date("2024-04-04T04:44:44Z"))).toBe(-360);
    });

    it("没有传入 date 时，应该使用当前时间计算本地 UTC offset", () => {
      vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(-540);

      expect(getLocalUtcOffset()).toBe(540);
    });

    it("应该支持非整点 offset，例如 UTC+5:30", () => {
      /**
       * UTC+5:30：
       * - Date#getTimezoneOffset() 返回 -330
       * - 我们需要的 UTC offset 是 330
       */
      vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(-330);

      expect(getLocalUtcOffset(new Date("2024-04-04T04:44:44Z"))).toBe(330);
    });
  });

  describe("toUtcOffsetZone", () => {
    it("应该把 0 转成 UTC+00:00", () => {
      expect(toUtcOffsetZone(0)).toBe("UTC+00:00");
    });

    it("应该把正数 offset 转成 UTC+HH:mm 格式", () => {
      expect(toUtcOffsetZone(480)).toBe("UTC+08:00");
      expect(toUtcOffsetZone(540)).toBe("UTC+09:00");
      expect(toUtcOffsetZone(180)).toBe("UTC+03:00");
    });

    it("应该把负数 offset 转成 UTC-HH:mm 格式", () => {
      expect(toUtcOffsetZone(-360)).toBe("UTC-06:00");
      expect(toUtcOffsetZone(-60)).toBe("UTC-01:00");
    });

    it("应该正确处理半小时 offset", () => {
      expect(toUtcOffsetZone(330)).toBe("UTC+05:30");
      expect(toUtcOffsetZone(-210)).toBe("UTC-03:30");
    });

    it("应该正确处理 45 分钟 offset", () => {
      expect(toUtcOffsetZone(345)).toBe("UTC+05:45");
      expect(toUtcOffsetZone(-345)).toBe("UTC-05:45");
    });

    it("应该正确补零，避免生成 UTC+8:0 这种无效或不规范格式", () => {
      expect(toUtcOffsetZone(8 * 60)).toBe("UTC+08:00");
      expect(toUtcOffsetZone(9 * 60 + 5)).toBe("UTC+09:05");
      expect(toUtcOffsetZone(-(9 * 60 + 5))).toBe("UTC-09:05");
    });

    it("应该正确处理小于 1 小时的负 offset", () => {
      expect(toUtcOffsetZone(-30)).toBe("UTC-00:30");
      expect(toUtcOffsetZone(-45)).toBe("UTC-00:45");
    });
  });

  describe("getLuxonDate", () => {
    /**
     * 配合实际使用，固定测试参数:
     * '2024-04-04T04:44:44Z'
     * '30 0 * * 5'
     **/
    const startDateStr = "2024-04-04T04:44:44Z";
    const cronTimeStr = "30 0 * * 5";

    it("应该使用 fixed offset zone 计算下一次 cron 时间，并且不依赖真实机器时区", () => {
      /**
       * 模拟 UTC+3。
       *
       * getLuxonDate 内部的 cron 表达式是：
       *
       *   30 0 * * 5
       *
       * 含义是：
       *
       *   每周五 00:30:00
       *
       * startDate 是：
       *
       *   2024-04-04T04:44:44Z
       *
       * 如果使用 UTC+3，则本地时间是：
       *
       *   2024-04-04 07:44:44 UTC+3，星期四
       *
       * 下一次周五 00:30:00 UTC+3 是：
       *
       *   2024-04-05 00:30:00 UTC+3
       *
       * 换算成 UTC 是：
       *
       *   2024-04-04T21:30:00Z
       */
      vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(-180);

      const nextDate = getLuxonDate(startDateStr, cronTimeStr);

      expect(nextDate.isValid).toBe(true);
      expect(nextDate.toUTC().toISO({ suppressMilliseconds: true })).toBe("2024-04-04T21:30:00Z");
    });

    it("应该随着本地 fixed offset 改变而得到不同的 UTC 结果", () => {
      /**
       * 模拟 UTC+8。
       *
       * startDate:
       *   2024-04-04T04:44:44Z
       *
       * 转成 UTC+8 本地时间：
       *   2024-04-04 12:44:44，星期四
       *
       * 下一次周五 00:30 UTC+8：
       *   2024-04-05 00:30:00 UTC+8
       *
       * 换算成 UTC：
       *   2024-04-04T16:30:00Z
       */
      vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(-480);

      const nextDate = getLuxonDate(startDateStr, cronTimeStr);

      expect(nextDate.isValid).toBe(true);
      expect(nextDate.toUTC().toISO({ suppressMilliseconds: true })).toBe("2024-04-04T16:30:00Z");
    });

    it("应该在 startDate 对应的日期上读取 getTimezoneOffset，而不是依赖真实系统时区", () => {
      const queriedDates: string[] = [];
      const getTimezoneOffsetSpy = vi.spyOn(Date.prototype, "getTimezoneOffset").mockImplementation(function (
        this: Date
      ) {
        queriedDates.push(this.toISOString());
        return -180;
      });

      const nextDate = getLuxonDate(startDateStr, cronTimeStr);

      expect(getTimezoneOffsetSpy).toHaveBeenCalled();
      expect(queriedDates).toContain("2024-04-04T04:44:44.000Z");
      expect(nextDate.toUTC().toISO({ suppressMilliseconds: true })).toBe("2024-04-04T21:30:00Z");
    });
  });

  describe("createCronJob", () => {
    it("当调用方没有传 timeZone 和 utcOffset 时，应该自动使用 fixed offset zone", () => {
      vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(-480);

      const onTick = vi.fn();

      const job = createCronJob({
        cronTime: "* * * * *",
        onTick,
      });

      /**
       * 这里期望 createCronJob 自动设置 fixed offset zone。
       *
       * 注意：
       * - 这里不是 IANA timezone
       * - 不是 Asia/Shanghai / Asia/Tokyo
       * - 而是 UTC+08:00 这种固定 offset zone
       */
      expect(job.cronTime.timeZone).toBe("UTC+08:00");
      expect(job.cronTime.utcOffset).toBeUndefined();

      /**
       * new CronJob(cronExpr, onTick) 默认不会自动 start。
       * 所以 createCronJob 也不应该改变这个行为。
       */
      expect(job.isActive).toBe(false);
    });

    it("当调用方没有传 timeZone 和 utcOffset 时，不应该修改原始 params 对象", () => {
      vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(-540);

      const onTick = vi.fn();

      const params = {
        cronTime: "* * * * *",
        onTick,
      };

      const job = createCronJob(params);

      expect(job.cronTime.timeZone).toBe("UTC+09:00");

      /**
       * createCronJob 内部应该通过新对象传给 CronJob.from，
       * 不要直接给 params.timeZone 或 params.utcOffset 赋值。
       */
      expect(params).toEqual({
        cronTime: "* * * * *",
        onTick,
      });
      expect("timeZone" in params).toBe(false);
      expect("utcOffset" in params).toBe(false);
    });

    it("当调用方显式传入 timeZone 时，应该尊重调用方的 timeZone", () => {
      vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(-480);

      const onTick = vi.fn();

      const job = createCronJob({
        cronTime: "* * * * *",
        onTick,
        timeZone: "UTC+09:00",
      });

      /**
       * 调用方已经显式指定 timeZone，
       * createCronJob 不应该覆盖成当前环境的 UTC+08:00。
       */
      expect(job.cronTime.timeZone).toBe("UTC+09:00");
      expect(job.cronTime.utcOffset).toBeUndefined();
      expect(job.isActive).toBe(false);
    });

    it("当调用方显式传入 utcOffset 时，应该尊重调用方的 utcOffset", () => {
      vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(-480);

      const onTick = vi.fn();

      const job = createCronJob({
        cronTime: "* * * * *",
        onTick,
        utcOffset: 540,
      });

      /**
       * 调用方已经显式指定 utcOffset，
       * createCronJob 不应该覆盖成当前环境的 UTC+08:00。
       */
      expect(job.cronTime.timeZone).toBeUndefined();
      expect(job.cronTime.utcOffset).toBe(540);
      expect(job.isActive).toBe(false);
    });

    it("timeZone 为 null 时，应该视为没有显式指定，并自动补 fixed offset zone", () => {
      vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(-480);

      const onTick = vi.fn();

      const job = createCronJob({
        cronTime: "* * * * *",
        onTick,
        timeZone: null,
      });

      expect(job.cronTime.timeZone).toBe("UTC+08:00");
      expect(job.cronTime.utcOffset).toBeUndefined();
    });

    it("utcOffset 为 null 时，应该视为没有显式指定，并自动补 fixed offset zone", () => {
      vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(-480);

      const onTick = vi.fn();

      const job = createCronJob({
        cronTime: "* * * * *",
        onTick,
        utcOffset: null,
      });

      expect(job.cronTime.timeZone).toBe("UTC+08:00");
      expect(job.cronTime.utcOffset).toBeUndefined();
    });

    it("应该保留 start: false 的默认行为，不自动启动任务", () => {
      vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(-480);

      const onTick = vi.fn();

      const job = createCronJob({
        cronTime: "* * * * *",
        onTick,
        start: false,
      });

      expect(job.isActive).toBe(false);
      expect(onTick).not.toHaveBeenCalled();
    });

    it("如果调用方显式传入 start: true，应该保留调用方行为并启动任务", () => {
      vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(-480);

      const onTick = vi.fn();

      const job = createCronJob({
        cronTime: "* * * * *",
        onTick,
        start: true,
      });

      try {
        expect(job.isActive).toBe(true);
      } finally {
        /**
         * start: true 会创建定时器。
         * 测试结束前必须 stop，避免测试进程因为定时器未清理而挂住。
         */
        job.stop();
      }
    });

    it("应该保留 name、threshold 等其他 CronJob 参数", () => {
      vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(-480);

      const onTick = vi.fn();

      const job = createCronJob({
        cronTime: "* * * * *",
        onTick,
        name: "test-cron-job",
        threshold: 1234,
      });

      expect(job.name).toBe("test-cron-job");
      expect(job.threshold).toBe(1234);
      expect(job.cronTime.timeZone).toBe("UTC+08:00");
    });

    it("应该保留 runOnInit 行为", () => {
      vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(-480);

      const onTick = vi.fn();

      const job = createCronJob({
        cronTime: "* * * * *",
        onTick,
        runOnInit: true,
      });

      /**
       * runOnInit 会在创建时立即触发 onTick。
       */
      expect(onTick).toHaveBeenCalledTimes(1);

      /**
       * runOnInit 不等于 start。
       * 没有 start: true 时，任务仍然不应该处于 active 状态。
       */
      expect(job.isActive).toBe(false);
    });

    it("如果调用方同时传入非 null 的 timeZone 和 utcOffset，应该交给 cron 抛出互斥参数错误", () => {
      const onTick = vi.fn();

      expect(() =>
        createCronJob({
          cronTime: "* * * * *",
          onTick,
          timeZone: "UTC+08:00",
          utcOffset: 480,
        } as never)
      ).toThrow(/exclusive|timeZone|utcOffset/i);
    });
  });
});
