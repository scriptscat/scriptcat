import { describe, it, expect, vi, beforeAll } from "vitest";
import { initTestLanguage } from "@Tests/initTestLanguage";
import type { ExternalAccessWriteNotice } from "./external_access/bridge";
import type * as ServiceWorkerUtils from "./utils";

// db 在模块顶层实例化 Dexie，而 Dexie 的 propagate-locally 会在 vmThreads 环境下裸调 addEventListener 而抛错，
// 因此本文件只在测试环境替换掉这个 DAO（同 log.test.ts）。
vi.mock("@App/app/repo/logger", () => ({ LoggerDAO: class {} }));

vi.mock("./utils", async (importOriginal) => {
  const actual = await importOriginal<typeof ServiceWorkerUtils>();
  return { ...actual, InfoNotification: vi.fn() };
});

import { notifyExternalAccessWrite } from "./index";
import { InfoNotification } from "./utils";

describe("外部接入「直接允许」写策略下的系统通知", () => {
  beforeAll(() => initTestLanguage("zh-CN"));

  const bodyOf = (notice: ExternalAccessWriteNotice): string => {
    vi.mocked(InfoNotification).mockClear();
    notifyExternalAccessWrite(notice);
    return vi.mocked(InfoNotification).mock.calls[0][1];
  };

  it("kind=update（外部客户端编辑了脚本源码）应说明脚本被编辑", () => {
    expect(bodyOf({ kind: "update", name: "签到助手" })).toBe("已编辑脚本「签到助手」");
  });

  it("没有专属文案的写操作仍落到泛化文案", () => {
    expect(bodyOf({ kind: "source_disclosure", name: "签到助手" })).toBe("已对「签到助手」执行变更");
  });
});
