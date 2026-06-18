// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import type { Group } from "@Packages/message/server";
import type { LoggerDAO } from "@App/app/repo/logger";
import { LogService } from "./log";

function fakeDAO(overrides: Partial<LoggerDAO> = {}) {
  return {
    queryLogs: vi.fn(() => Promise.resolve([])),
    delete: vi.fn(() => Promise.resolve(1)),
    clear: vi.fn(() => Promise.resolve()),
    ...overrides,
  } as unknown as LoggerDAO;
}

const fakeGroup = () => ({ on: vi.fn() }) as unknown as Group;

describe("日志服务 LogService", () => {
  it("getLogs 按时间范围委托 DAO 查询", async () => {
    const sample = [{ id: 1, level: "info", message: "x", label: {}, createtime: 5 }];
    const dao = fakeDAO({ queryLogs: vi.fn(() => Promise.resolve(sample)) as LoggerDAO["queryLogs"] });
    const svc = new LogService(fakeGroup(), dao);
    const res = await svc.getLogs({ start: 10, end: 20 });
    expect(dao.queryLogs).toHaveBeenCalledWith(10, 20);
    expect(res).toBe(sample);
  });

  it("deleteLogs 逐个按 id 删除", async () => {
    const dao = fakeDAO();
    const svc = new LogService(fakeGroup(), dao);
    await svc.deleteLogs([1, 2, 3]);
    expect(dao.delete).toHaveBeenCalledTimes(3);
    expect(dao.delete).toHaveBeenCalledWith(1);
    expect(dao.delete).toHaveBeenCalledWith(3);
  });

  it("clearLogs 清空 DAO", async () => {
    const dao = fakeDAO();
    const svc = new LogService(fakeGroup(), dao);
    await svc.clearLogs();
    expect(dao.clear).toHaveBeenCalledTimes(1);
  });

  it("init 注册 getLogs/deleteLogs/clearLogs 三个处理器", () => {
    const group = fakeGroup();
    new LogService(group, fakeDAO()).init();
    expect((group.on as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual([
      "getLogs",
      "deleteLogs",
      "clearLogs",
    ]);
  });
});
