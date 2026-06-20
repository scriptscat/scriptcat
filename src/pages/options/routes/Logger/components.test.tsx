import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { initLanguage, t } from "@App/locales/locales";
import { Calendar, RefreshControl, TimeRangePicker } from "./components";

beforeEach(() => {
  initLanguage("zh-CN");
});
afterEach(() => cleanup());

describe("自动刷新控件 RefreshControl", () => {
  it("点击刷新图标触发 onRefresh", () => {
    const onRefresh = vi.fn();
    render(<RefreshControl interval="off" onRefresh={onRefresh} onIntervalChange={() => {}} />);
    fireEvent.click(screen.getByTestId("refresh-button"));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("选择自动刷新间隔触发 onIntervalChange", async () => {
    const onIntervalChange = vi.fn();
    render(<RefreshControl interval="off" onRefresh={() => {}} onIntervalChange={onIntervalChange} />);
    fireEvent.click(screen.getByTestId("interval-trigger"));
    fireEvent.click(await screen.findByTestId("interval-option-30s"));
    expect(onIntervalChange).toHaveBeenCalledWith("30s");
  });
});

describe("统一时间范围选择器 TimeRangePicker", () => {
  it("锁定至今时触发按钮显示当前预设标签", () => {
    render(
      <TimeRangePicker
        preset="24h"
        isNow
        range={{ start: 0, end: 1 }}
        onSelectPreset={() => {}}
        onApplyRange={() => {}}
      />
    );
    expect(screen.getByTestId("time-range-trigger").textContent).toContain(t("logs:last_24_hours"));
  });

  it("选择快捷范围触发 onSelectPreset", async () => {
    const onSelectPreset = vi.fn();
    render(
      <TimeRangePicker
        preset="24h"
        isNow
        range={{ start: 0, end: 1 }}
        onSelectPreset={onSelectPreset}
        onApplyRange={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId("time-range-trigger"));
    fireEvent.click(await screen.findByTestId("quick-range-1h"));
    expect(onSelectPreset).toHaveBeenCalledWith("1h");
  });

  it("应用绝对范围按当前起止时间触发 onApplyRange", async () => {
    const onApplyRange = vi.fn();
    const start = new Date(2026, 5, 16, 9, 32, 0).getTime();
    const end = new Date(2026, 5, 16, 10, 32, 0).getTime();
    render(
      <TimeRangePicker
        preset={null}
        isNow={false}
        range={{ start, end }}
        onSelectPreset={() => {}}
        onApplyRange={onApplyRange}
      />
    );
    fireEvent.click(screen.getByTestId("time-range-trigger"));
    fireEvent.click(await screen.findByTestId("apply-range"));
    expect(onApplyRange).toHaveBeenCalledWith(start, end);
  });
});

describe("日期时间日历 Calendar", () => {
  it("点击某一天返回该日期且保留原有时分秒", () => {
    const onChange = vi.fn();
    const value = new Date(2026, 5, 16, 10, 32, 5);
    render(<Calendar value={value} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("calendar-day-20"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const arg = onChange.mock.calls[0][0] as Date;
    expect(arg.getFullYear()).toBe(2026);
    expect(arg.getMonth()).toBe(5);
    expect(arg.getDate()).toBe(20);
    expect(arg.getHours()).toBe(10);
    expect(arg.getMinutes()).toBe(32);
    expect(arg.getSeconds()).toBe(5);
  });
});
