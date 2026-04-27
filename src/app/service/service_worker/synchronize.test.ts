import { describe, it, expect, vi, beforeEach } from "vitest";
import { SynchronizeService } from "./synchronize";
import { initTestEnv } from "@Tests/utils";
import type FileSystem from "@Packages/filesystem/filesystem";
import type { CloudSyncConfig } from "@App/pkg/config/config";

initTestEnv();

const syncConfig: CloudSyncConfig = {
  enable: true,
  syncDelete: true,
  syncStatus: true,
  filesystem: "webdav",
  params: {},
};

const createFs = (overrides: Partial<FileSystem> = {}): FileSystem =>
  ({
    verify: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    open: vi.fn(),
    openDir: vi.fn(),
    create: vi.fn().mockResolvedValue({
      write: vi.fn().mockResolvedValue(undefined),
    }),
    createDir: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getDirUrl: vi.fn().mockResolvedValue(""),
    ...overrides,
  }) as unknown as FileSystem;

// 等待若干轮微任务，确保所有已就绪的 await 都被推进
const flushMicrotasks = async (rounds = 10) => {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
};

describe("SynchronizeService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chrome.storage.local.clear();
  });

  it("serializes concurrent syncOnce calls", async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const order: string[] = [];
    // gate 放在第一轮的最后一步（updateFileDigest 内部的 fs.list）
    // 这样如果未来锁粒度被改小，第二轮提前进入也会被这个测试捕获
    const fs1List = vi
      .fn()
      .mockImplementationOnce(async () => {
        order.push("first:list");
        return [];
      })
      .mockImplementationOnce(async () => {
        order.push("first:digest");
        await firstGate;
        order.push("first:end");
        return [];
      });
    const fs1 = createFs({ list: fs1List });
    const fs2 = createFs({
      list: vi.fn().mockImplementation(async () => {
        order.push("second:list");
        return [];
      }),
    });
    const service = new SynchronizeService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        scriptCodeDAO: {},
        all: vi.fn().mockResolvedValue([]),
      } as any
    );

    const first = service.syncOnce(syncConfig, fs1);
    const second = service.syncOnce(syncConfig, fs2);
    await flushMicrotasks();

    // 第一轮已经跑到末尾的 updateFileDigest，第二轮一步都没开始
    expect(order).toEqual(["first:list", "first:digest"]);
    expect((fs2.list as any).mock.calls.length).toBe(0);

    releaseFirst();
    await Promise.all([first, second]);

    // 第一轮整体结束（first:end）后第二轮才能开始（second:list）
    expect(order.slice(0, 4)).toEqual(["first:list", "first:digest", "first:end", "second:list"]);
  });

  it("does not delete orphan cloud script without meta", async () => {
    const fs = createFs({
      list: vi.fn().mockResolvedValue([
        {
          name: "orphan.user.js",
          path: "orphan.user.js",
          size: 1,
          digest: "d1",
          createtime: 1,
          updatetime: 1,
        },
      ]),
    });
    const service = new SynchronizeService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        scriptCodeDAO: {},
        all: vi.fn().mockResolvedValue([]),
      } as any
    );

    await service.syncOnce(syncConfig, fs);

    expect(fs.delete).not.toHaveBeenCalled();
  });

  it("preserves cloudStatus for skipped orphan uuid when writing scriptcat-sync.json", async () => {
    const orphanStatus = { enable: false, sort: 7, updatetime: 100 };
    const writeMock = vi.fn().mockResolvedValue(undefined);
    const fs = createFs({
      list: vi.fn().mockResolvedValue([
        {
          name: "orphan.user.js",
          path: "orphan.user.js",
          size: 1,
          digest: "d1",
          createtime: 1,
          updatetime: 1,
        },
        {
          name: "scriptcat-sync.json",
          path: "scriptcat-sync.json",
          size: 1,
          digest: "d2",
          createtime: 1,
          updatetime: 1,
        },
      ]),
      open: vi.fn().mockResolvedValue({
        read: vi.fn().mockResolvedValue(
          JSON.stringify({
            version: "1.0.0",
            status: { scripts: { orphan: orphanStatus } },
          })
        ),
      }),
      create: vi.fn().mockResolvedValue({ write: writeMock }),
    });
    const service = new SynchronizeService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        scriptCodeDAO: {},
        all: vi.fn().mockResolvedValue([]),
      } as any
    );

    await service.syncOnce(syncConfig, fs);

    // 第一次 write 是 scriptcat-sync.json 的内容
    expect(writeMock).toHaveBeenCalled();
    const writtenContent = writeMock.mock.calls[0][0] as string;
    const written = JSON.parse(writtenContent);
    expect(written.status.scripts.orphan).toEqual(orphanStatus);
  });

  it("waits for installScript during pullScript", async () => {
    let releaseInstall!: () => void;
    const installGate = new Promise<void>((resolve) => {
      releaseInstall = resolve;
    });
    const installScript = vi.fn().mockImplementation(() => installGate);
    const fs = createFs({
      open: vi.fn().mockImplementation(async (file) => ({
        read: vi.fn().mockResolvedValue(
          file.name.endsWith(".user.js")
            ? `// ==UserScript==
// @name Pull Test
// @namespace sync-test
// @match https://example.com/*
// ==/UserScript==
console.log("ok");`
            : JSON.stringify({ uuid: "pull-uuid" })
        ),
      })),
    });
    const service = new SynchronizeService(
      {} as any,
      {} as any,
      {
        installScript,
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        scriptCodeDAO: {},
      } as any
    );

    let settled = false;
    const pullPromise = service
      .pullScript(
        fs,
        {
          script: {
            name: "pull-uuid.user.js",
            path: "pull-uuid.user.js",
            size: 1,
            digest: "d1",
            createtime: 1,
            updatetime: 1,
          },
          meta: {
            name: "pull-uuid.meta.json",
            path: "pull-uuid.meta.json",
            size: 1,
            digest: "d2",
            createtime: 1,
            updatetime: 1,
          },
        },
        undefined
      )
      .then(() => {
        settled = true;
      });

    await Promise.resolve();
    expect(settled).toBe(false);

    releaseInstall();
    await pullPromise;

    expect(installScript).toHaveBeenCalledTimes(1);
    expect(settled).toBe(true);
  });

  it("waits for deleteScript before updating file digest", async () => {
    let releaseDelete!: () => void;
    const deleteGate = new Promise<void>((resolve) => {
      releaseDelete = resolve;
    });
    const order: string[] = [];
    const deleteScript = vi.fn().mockImplementation(async () => {
      order.push("delete:start");
      await deleteGate;
      order.push("delete:end");
    });
    // fs.list 第二次调用对应 updateFileDigest，这是 syncOnce 的最后一步
    const fsList = vi
      .fn()
      .mockImplementationOnce(async () => [
        {
          name: "del-uuid.meta.json",
          path: "del-uuid.meta.json",
          size: 1,
          digest: "d1",
          createtime: 1,
          updatetime: 1,
        },
      ])
      .mockImplementationOnce(async () => {
        order.push("digest:list");
        return [];
      });
    const fs = createFs({
      list: fsList,
      open: vi.fn().mockResolvedValue({
        read: vi.fn().mockResolvedValue(JSON.stringify({ uuid: "del-uuid", isDeleted: true })),
      }),
    });
    const service = new SynchronizeService(
      {} as any,
      {} as any,
      { deleteScript } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        scriptCodeDAO: {},
        all: vi.fn().mockResolvedValue([
          {
            uuid: "del-uuid",
            name: "del",
            updatetime: 1,
            createtime: 1,
            status: 1,
            sort: 0,
            metadata: {},
          },
        ]),
      } as any
    );

    const promise = service.syncOnce(syncConfig, fs);
    await flushMicrotasks();

    // delete 已经开始但没结束，updateFileDigest 还没被调用
    expect(order).toEqual(["delete:start"]);

    releaseDelete();
    await promise;

    // delete 必须在 updateFileDigest 之前完成
    expect(order).toEqual(["delete:start", "delete:end", "digest:list"]);
  });

  it("waits for pushScript before updating file digest", async () => {
    let releasePush!: () => void;
    const pushGate = new Promise<void>((resolve) => {
      releasePush = resolve;
    });
    const order: string[] = [];
    // pushScript 内部第一步是 fs.create(uuid.user.js)，gate 在这里就能拦住整个 push
    const fsCreate = vi.fn().mockImplementation(async (filename: string) => {
      if (filename === "push-uuid.user.js") {
        order.push("push:start");
        await pushGate;
        order.push("push:end");
      }
      return { write: vi.fn().mockResolvedValue(undefined) };
    });
    const fsList = vi
      .fn()
      .mockImplementationOnce(async () => [])
      .mockImplementationOnce(async () => {
        order.push("digest:list");
        return [];
      });
    const fs = createFs({
      list: fsList,
      create: fsCreate,
    });
    const service = new SynchronizeService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        scriptCodeDAO: {
          get: vi.fn().mockResolvedValue({ code: "// code" }),
        },
        all: vi.fn().mockResolvedValue([
          {
            uuid: "push-uuid",
            name: "push",
            updatetime: 1,
            createtime: 1,
            status: 1,
            sort: 0,
            metadata: {},
          },
        ]),
      } as any
    );

    const promise = service.syncOnce(syncConfig, fs);
    await flushMicrotasks();

    // push 已经开始但没结束，updateFileDigest 还没被调用
    expect(order).toEqual(["push:start"]);

    releasePush();
    await promise;

    // push 必须在 updateFileDigest 之前完成
    expect(order).toContain("push:end");
    expect(order).toContain("digest:list");
    expect(order.indexOf("push:end")).toBeLessThan(order.indexOf("digest:list"));
  });
});
