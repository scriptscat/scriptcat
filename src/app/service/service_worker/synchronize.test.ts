import { describe, it, expect, vi, beforeEach } from "vitest";
import { SynchronizeService } from "./synchronize";
import { initTestEnv } from "@Tests/utils";
import type FileSystem from "@Packages/filesystem/filesystem";
import { FileSystemError } from "@Packages/filesystem/error";
import type { CloudSyncConfig } from "@App/pkg/config/config";
import { stackAsyncTask } from "@App/pkg/utils/async_queue";
import { md5OfText } from "@App/pkg/utils/crypto";

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

  it("兼容缺少 status.scripts 的旧版 scriptcat-sync.json", async () => {
    const writeMock = vi.fn().mockResolvedValue(undefined);
    const fs = createFs({
      list: vi.fn().mockResolvedValue([
        {
          name: "scriptcat-sync.json",
          path: "scriptcat-sync.json",
          size: 1,
          digest: "sync-digest",
          createtime: 1,
          updatetime: 1,
        },
      ]),
      open: vi.fn().mockResolvedValue({
        read: vi.fn().mockResolvedValue(JSON.stringify({ version: "1.0.0" })),
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

    expect(writeMock).toHaveBeenCalledTimes(1);
    const written = JSON.parse(writeMock.mock.calls[0][0] as string);
    expect(written.status.scripts).toEqual({});
  });

  it("scriptcat-sync.json 损坏时不阻塞脚本同步且不覆盖状态文件", async () => {
    const createMock = vi.fn().mockResolvedValue({
      write: vi.fn().mockResolvedValue(undefined),
    });
    const fs = createFs({
      list: vi
        .fn()
        .mockResolvedValueOnce([
          {
            name: "scriptcat-sync.json",
            path: "scriptcat-sync.json",
            size: 1,
            digest: "sync-digest",
            createtime: 1,
            updatetime: 1,
          },
        ])
        .mockResolvedValueOnce([
          {
            name: "ok.user.js",
            path: "ok.user.js",
            size: 1,
            digest: "cloud-ok-user",
            createtime: 1,
            updatetime: 1,
          },
          {
            name: "ok.meta.json",
            path: "ok.meta.json",
            size: 1,
            digest: "cloud-ok-meta",
            createtime: 1,
            updatetime: 1,
          },
        ]),
      open: vi.fn().mockResolvedValue({
        read: vi.fn().mockResolvedValue("{"),
      }),
      create: createMock,
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
        all: vi.fn().mockResolvedValue([
          {
            uuid: "ok",
            name: "ok",
            updatetime: 1,
            createtime: 1,
            status: 1,
            sort: 0,
            metadata: {},
          },
        ]),
      } as any
    );
    vi.spyOn(service, "pushScript").mockResolvedValue({
      "ok.user.js": "pushed-ok-user",
      "ok.meta.json": "pushed-ok-meta",
    });

    await service.syncOnce(syncConfig, fs);

    expect(service.pushScript).toHaveBeenCalledTimes(1);
    expect(createMock).not.toHaveBeenCalled();
    await expect((service as any).storage.get("file_digest")).resolves.toEqual({
      "ok.user.js": "cloud-ok-user",
      "ok.meta.json": "cloud-ok-meta",
    });
  });

  it("写回 scriptcat-sync.json 前重新读取远端状态，避免覆盖其他设备更新", async () => {
    const initialStatus = { enable: false, sort: 7, updatetime: 200 };
    const latestStatus = { enable: true, sort: 9, updatetime: 300 };
    const writeMock = vi.fn().mockResolvedValue(undefined);
    const syncFile = {
      name: "scriptcat-sync.json",
      path: "scriptcat-sync.json",
      size: 1,
      digest: "sync-digest",
      createtime: 1,
      updatetime: 1,
    };
    const fs = createFs({
      list: vi.fn().mockResolvedValue([
        {
          name: "status-uuid.user.js",
          path: "status-uuid.user.js",
          size: 1,
          digest: "script-digest",
          createtime: 1,
          updatetime: 1,
        },
        {
          name: "status-uuid.meta.json",
          path: "status-uuid.meta.json",
          size: 1,
          digest: "meta-digest",
          createtime: 1,
          updatetime: 1,
        },
        syncFile,
      ]),
      open: vi
        .fn()
        .mockResolvedValueOnce({
          read: vi.fn().mockResolvedValue(
            JSON.stringify({
              version: "1.0.0",
              status: { scripts: { "status-uuid": initialStatus } },
            })
          ),
        })
        .mockResolvedValueOnce({
          read: vi.fn().mockResolvedValue(
            JSON.stringify({
              version: "1.0.0",
              status: { scripts: { "status-uuid": latestStatus } },
            })
          ),
        }),
      create: vi.fn().mockResolvedValue({ write: writeMock }),
    });
    const scriptDAO = {
      scriptCodeDAO: {},
      all: vi.fn().mockResolvedValue([
        {
          uuid: "status-uuid",
          name: "status",
          updatetime: 100,
          createtime: 1,
          status: 1,
          sort: 1,
          metadata: {},
        },
      ]),
      update: vi.fn().mockResolvedValue(undefined),
    };
    const service = new SynchronizeService(
      {} as any,
      {} as any,
      {
        enableScript: vi.fn().mockResolvedValue(undefined),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      scriptDAO as any
    );
    await (service as any).storage.set("file_digest", {
      "status-uuid.user.js": "script-digest",
    });

    await service.syncOnce(syncConfig, fs);

    expect(fs.open).toHaveBeenCalledTimes(2);
    const written = JSON.parse(writeMock.mock.calls[0][0] as string);
    expect(written.status.scripts["status-uuid"]).toEqual(latestStatus);
  });

  it("写回 scriptcat-sync.json 时本地较新的状态仍覆盖远端旧状态", async () => {
    const initialStatus = { enable: false, sort: 7, updatetime: 100 };
    const latestStatus = { enable: false, sort: 8, updatetime: 150 };
    const localStatus = { enable: true, sort: 1, updatetime: 200 };
    const writeMock = vi.fn().mockResolvedValue(undefined);
    const fs = createFs({
      list: vi.fn().mockResolvedValue([
        {
          name: "status-uuid.user.js",
          path: "status-uuid.user.js",
          size: 1,
          digest: "script-digest",
          createtime: 1,
          updatetime: 1,
        },
        {
          name: "status-uuid.meta.json",
          path: "status-uuid.meta.json",
          size: 1,
          digest: "meta-digest",
          createtime: 1,
          updatetime: 1,
        },
        {
          name: "scriptcat-sync.json",
          path: "scriptcat-sync.json",
          size: 1,
          digest: "sync-digest",
          createtime: 1,
          updatetime: 1,
        },
      ]),
      open: vi
        .fn()
        .mockResolvedValueOnce({
          read: vi.fn().mockResolvedValue(
            JSON.stringify({
              version: "1.0.0",
              status: { scripts: { "status-uuid": initialStatus } },
            })
          ),
        })
        .mockResolvedValueOnce({
          read: vi.fn().mockResolvedValue(
            JSON.stringify({
              version: "1.0.0",
              status: { scripts: { "status-uuid": latestStatus } },
            })
          ),
        }),
      create: vi.fn().mockResolvedValue({ write: writeMock }),
    });
    const service = new SynchronizeService(
      {} as any,
      {} as any,
      {
        enableScript: vi.fn().mockResolvedValue(undefined),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        scriptCodeDAO: {},
        all: vi.fn().mockResolvedValue([
          {
            uuid: "status-uuid",
            name: "status",
            updatetime: localStatus.updatetime,
            createtime: 1,
            status: 1,
            sort: localStatus.sort,
            metadata: {},
          },
        ]),
        update: vi.fn().mockResolvedValue(undefined),
      } as any
    );
    await (service as any).storage.set("file_digest", {
      "status-uuid.user.js": "script-digest",
    });

    await service.syncOnce(syncConfig, fs);

    expect(fs.open).toHaveBeenCalledTimes(2);
    const written = JSON.parse(writeMock.mock.calls[0][0] as string);
    expect(written.status.scripts["status-uuid"]).toEqual(localStatus);
  });

  it("syncStatus 单个脚本排序更新失败时不阻塞整轮同步", async () => {
    const cloudStatus = { enable: true, sort: 9, updatetime: 200 };
    const writeMock = vi.fn().mockResolvedValue(undefined);
    const fs = createFs({
      list: vi.fn().mockResolvedValue([
        {
          name: "status-uuid.user.js",
          path: "status-uuid.user.js",
          size: 1,
          digest: "script-digest",
          createtime: 1,
          updatetime: 1,
        },
        {
          name: "status-uuid.meta.json",
          path: "status-uuid.meta.json",
          size: 1,
          digest: "meta-digest",
          createtime: 1,
          updatetime: 1,
        },
        {
          name: "scriptcat-sync.json",
          path: "scriptcat-sync.json",
          size: 1,
          digest: "sync-digest",
          createtime: 1,
          updatetime: 1,
        },
      ]),
      open: vi.fn().mockResolvedValue({
        read: vi.fn().mockResolvedValue(
          JSON.stringify({
            version: "1.0.0",
            status: { scripts: { "status-uuid": cloudStatus } },
          })
        ),
      }),
      create: vi.fn().mockResolvedValue({ write: writeMock }),
    });
    const scriptDAO = {
      scriptCodeDAO: {},
      all: vi.fn().mockResolvedValue([
        {
          uuid: "status-uuid",
          name: "status",
          updatetime: 100,
          createtime: 1,
          status: 1,
          sort: 1,
          metadata: {},
        },
      ]),
      update: vi.fn().mockRejectedValue(new Error("sort update failed")),
    };
    const service = new SynchronizeService(
      {} as any,
      {} as any,
      {
        enableScript: vi.fn().mockResolvedValue(undefined),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      scriptDAO as any
    );
    await (service as any).storage.set("file_digest", {
      "status-uuid.user.js": "script-digest",
      "status-uuid.meta.json": "meta-digest",
      "scriptcat-sync.json": "sync-digest",
    });

    await service.syncOnce(syncConfig, fs);

    expect(scriptDAO.update).toHaveBeenCalledWith("status-uuid", { sort: cloudStatus.sort });
    expect(writeMock).toHaveBeenCalledTimes(1);
    const written = JSON.parse(writeMock.mock.calls[0][0] as string);
    expect(written.status.scripts["status-uuid"]).toEqual(cloudStatus);
    await expect((service as any).storage.get("file_digest")).resolves.toMatchObject({
      "status-uuid.user.js": "script-digest",
      "status-uuid.meta.json": "meta-digest",
      "scriptcat-sync.json": "sync-digest",
    });
  });

  it("脚本文件同步失败时仍可回写其它脚本的 syncStatus 并保留失败脚本云端状态", async () => {
    const failedCloudStatus = { enable: false, sort: 3, updatetime: 300 };
    const okCloudStatus = { enable: false, sort: 1, updatetime: 100 };
    const okLocalStatus = { enable: true, sort: 9, updatetime: 200 };
    const writeMock = vi.fn().mockResolvedValue(undefined);
    const fs = createFs({
      list: vi.fn().mockResolvedValue([
        {
          name: "failed.user.js",
          path: "failed.user.js",
          size: 1,
          digest: "failed-new-digest",
          createtime: 1,
          updatetime: 300,
        },
        {
          name: "failed.meta.json",
          path: "failed.meta.json",
          size: 1,
          digest: "failed-meta-digest",
          createtime: 1,
          updatetime: 300,
        },
        {
          name: "ok.user.js",
          path: "ok.user.js",
          size: 1,
          digest: "ok-digest",
          createtime: 1,
          updatetime: 1,
        },
        {
          name: "ok.meta.json",
          path: "ok.meta.json",
          size: 1,
          digest: "ok-meta-digest",
          createtime: 1,
          updatetime: 1,
        },
        {
          name: "scriptcat-sync.json",
          path: "scriptcat-sync.json",
          size: 1,
          digest: "sync-digest",
          createtime: 1,
          updatetime: 1,
        },
      ]),
      open: vi.fn().mockImplementation((file) => {
        if (file.name === "scriptcat-sync.json") {
          return Promise.resolve({
            read: vi.fn().mockResolvedValue(
              JSON.stringify({
                version: "1.0.0",
                status: {
                  scripts: {
                    failed: failedCloudStatus,
                    ok: okCloudStatus,
                  },
                },
              })
            ),
          });
        }
        return Promise.reject(new Error("read failed"));
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
        all: vi.fn().mockResolvedValue([
          {
            uuid: "failed",
            name: "failed",
            updatetime: 1,
            createtime: 1,
            status: 1,
            sort: 1,
            metadata: {},
          },
          {
            uuid: "ok",
            name: "ok",
            updatetime: okLocalStatus.updatetime,
            createtime: 1,
            status: 1,
            sort: okLocalStatus.sort,
            metadata: {},
          },
        ]),
        update: vi.fn().mockResolvedValue(undefined),
      } as any
    );
    await (service as any).storage.set("file_digest", {
      "failed.user.js": "failed-old-digest",
      "failed.meta.json": "failed-meta-digest",
      "ok.user.js": "ok-digest",
      "ok.meta.json": "ok-meta-digest",
    });

    await service.syncOnce(syncConfig, fs);

    expect(writeMock).toHaveBeenCalledTimes(1);
    const written = JSON.parse(writeMock.mock.calls[0][0] as string);
    expect(written.status.scripts.failed).toEqual(failedCloudStatus);
    expect(written.status.scripts.ok).toEqual(okLocalStatus);
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

  it("同一轮同步多个远端删除标记只发送一条删除通知", async () => {
    const fs = createFs({
      list: vi
        .fn()
        .mockResolvedValueOnce([
          {
            name: "first.meta.json",
            path: "first.meta.json",
            size: 1,
            digest: "d1",
            createtime: 1,
            updatetime: 1,
          },
          {
            name: "second.meta.json",
            path: "second.meta.json",
            size: 1,
            digest: "d2",
            createtime: 1,
            updatetime: 1,
          },
        ])
        .mockResolvedValueOnce([]),
      open: vi.fn().mockImplementation(async (file) => ({
        read: vi.fn().mockResolvedValue(JSON.stringify({ uuid: file.name.replace(".meta.json", ""), isDeleted: true })),
      })),
    });
    const deleteScript = vi.fn().mockResolvedValue(undefined);
    const notificationSpy = vi.spyOn(chrome.notifications, "create");
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
            uuid: "first",
            name: "first",
            updatetime: 1,
            createtime: 1,
            status: 1,
            sort: 0,
            metadata: {},
          },
          {
            uuid: "second",
            name: "second",
            updatetime: 1,
            createtime: 1,
            status: 1,
            sort: 1,
            metadata: {},
          },
        ]),
      } as any
    );

    await service.syncOnce({ ...syncConfig, syncStatus: false }, fs);

    expect(deleteScript).toHaveBeenCalledTimes(2);
    expect(notificationSpy).toHaveBeenCalledTimes(1);
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

  it("keeps pushed script digest when cloud list is stale after upload", async () => {
    const scriptCode = "// code";
    const script = {
      uuid: "push-uuid",
      name: "push",
      origin: "origin",
      downloadUrl: "download-url",
      checkUpdateUrl: "check-update-url",
      updatetime: 1,
      createtime: 1,
      status: 1,
      sort: 0,
      metadata: {},
    };
    const fs = createFs({
      list: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]),
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
          get: vi.fn().mockResolvedValue({ code: scriptCode }),
        },
        all: vi.fn().mockResolvedValue([script]),
      } as any
    );

    await service.syncOnce({ ...syncConfig, syncStatus: false }, fs);

    const metaJson = JSON.stringify({
      uuid: script.uuid,
      origin: script.origin,
      downloadUrl: script.downloadUrl,
      checkUpdateUrl: script.checkUpdateUrl,
    });
    await expect((service as any).storage.get("file_digest")).resolves.toEqual({
      "push-uuid.user.js": md5OfText(scriptCode),
      "push-uuid.meta.json": md5OfText(metaJson),
    });
  });

  it("push 已有云端文件时应当用旧 digest 作为 expectedDigest", async () => {
    const script = {
      uuid: "push-uuid",
      name: "push",
      origin: "origin",
      downloadUrl: "download-url",
      checkUpdateUrl: "check-update-url",
      updatetime: 10,
      createtime: 1,
      status: 1,
      sort: 0,
      metadata: {},
    };
    const fs = createFs({
      capabilities: {
        supportsAtomicCompareAndSwap: true,
      },
      list: vi
        .fn()
        .mockResolvedValueOnce([
          {
            name: "push-uuid.user.js",
            path: "push-uuid.user.js",
            size: 1,
            digest: "cloud-user-new",
            createtime: 1,
            updatetime: 1,
          },
          {
            name: "push-uuid.meta.json",
            path: "push-uuid.meta.json",
            size: 1,
            digest: "cloud-meta-new",
            createtime: 1,
            updatetime: 1,
          },
        ])
        .mockResolvedValueOnce([]),
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
        all: vi.fn().mockResolvedValue([script]),
      } as any
    );
    await (service as any).storage.set("file_digest", {
      "push-uuid.user.js": "old-user-digest",
      "push-uuid.meta.json": "old-meta-digest",
    });

    await service.syncOnce({ ...syncConfig, syncStatus: false }, fs);

    expect(fs.create).toHaveBeenCalledWith(
      "push-uuid.user.js",
      expect.objectContaining({ expectedDigest: "old-user-digest" })
    );
    expect(fs.create).toHaveBeenCalledWith(
      "push-uuid.meta.json",
      expect.objectContaining({ expectedDigest: "old-meta-digest" })
    );
  });

  it("push 云端缺失文件时应当使用 createOnly，避免覆盖并发新增", async () => {
    const script = {
      uuid: "new-uuid",
      name: "new",
      origin: "origin",
      downloadUrl: "download-url",
      checkUpdateUrl: "check-update-url",
      updatetime: 10,
      createtime: 1,
      status: 1,
      sort: 0,
      metadata: {},
    };
    const fs = createFs({
      capabilities: {
        supportsCreateOnly: true,
      },
      list: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]),
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
        all: vi.fn().mockResolvedValue([script]),
      } as any
    );

    await service.syncOnce({ ...syncConfig, syncStatus: false }, fs);

    expect(fs.create).toHaveBeenCalledWith("new-uuid.user.js", expect.objectContaining({ createOnly: true }));
    expect(fs.create).toHaveBeenCalledWith("new-uuid.meta.json", expect.objectContaining({ createOnly: true }));
  });

  it("没有能力声明时 push 不应传条件写入参数", async () => {
    const script = {
      uuid: "push-uuid",
      name: "push",
      origin: "origin",
      downloadUrl: "download-url",
      checkUpdateUrl: "check-update-url",
      updatetime: 10,
      createtime: 1,
      status: 1,
      sort: 0,
      metadata: {},
    };
    const fs = createFs({
      list: vi
        .fn()
        .mockResolvedValueOnce([
          {
            name: "push-uuid.user.js",
            path: "push-uuid.user.js",
            size: 1,
            digest: "cloud-user-new",
            createtime: 1,
            updatetime: 1,
          },
        ])
        .mockResolvedValueOnce([]),
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
        all: vi.fn().mockResolvedValue([script]),
      } as any
    );
    await (service as any).storage.set("file_digest", {
      "push-uuid.user.js": "old-user-digest",
    });

    await service.syncOnce({ ...syncConfig, syncStatus: false }, fs);

    expect(fs.create).toHaveBeenCalledWith(
      "push-uuid.user.js",
      expect.not.objectContaining({
        expectedDigest: expect.anything(),
        createOnly: expect.anything(),
      })
    );
  });

  it("部分 push 失败时只推进成功文件 digest 并保留失败文件旧 digest", async () => {
    const fs = createFs({
      list: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            name: "ok.user.js",
            path: "ok.user.js",
            size: 1,
            digest: "cloud-ok-new",
            createtime: 1,
            updatetime: 1,
          },
          {
            name: "bad.user.js",
            path: "bad.user.js",
            size: 1,
            digest: "cloud-bad-new",
            createtime: 1,
            updatetime: 1,
          },
          {
            name: "bad.meta.json",
            path: "bad.meta.json",
            size: 1,
            digest: "cloud-bad-meta-new",
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
        all: vi.fn().mockResolvedValue([
          {
            uuid: "ok",
            name: "ok",
            updatetime: 1,
            createtime: 1,
            status: 1,
            sort: 0,
            metadata: {},
          },
          {
            uuid: "bad",
            name: "bad",
            updatetime: 1,
            createtime: 1,
            status: 1,
            sort: 1,
            metadata: {},
          },
        ]),
      } as any
    );
    vi.spyOn(service, "pushScript").mockImplementation(async (_fs, script: any) => {
      if (script.uuid === "bad") {
        throw new Error("push failed");
      }
      return {
        "ok.user.js": "ok-user-new",
        "ok.meta.json": "ok-meta-new",
      };
    });
    await (service as any).storage.set("file_digest", {
      "bad.user.js": "bad-user-old",
      "bad.meta.json": "bad-meta-old",
    });

    await service.syncOnce({ ...syncConfig, syncStatus: false }, fs);

    await expect((service as any).storage.get("file_digest")).resolves.toEqual({
      "ok.user.js": "cloud-ok-new",
      "bad.user.js": "bad-user-old",
      "bad.meta.json": "bad-meta-old",
      "ok.meta.json": "ok-meta-new",
    });
  });

  it("单文件同步遇到 typed conflict 时应在日志中标记 conflict 分类", async () => {
    const fs = createFs({
      list: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            name: "ok.user.js",
            path: "ok.user.js",
            size: 1,
            digest: "cloud-ok-new",
            createtime: 1,
            updatetime: 1,
          },
          {
            name: "bad.user.js",
            path: "bad.user.js",
            size: 1,
            digest: "cloud-bad-new",
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
        all: vi.fn().mockResolvedValue([
          {
            uuid: "ok",
            name: "ok",
            updatetime: 1,
            createtime: 1,
            status: 1,
            sort: 0,
            metadata: {},
          },
          {
            uuid: "bad",
            name: "bad",
            updatetime: 1,
            createtime: 1,
            status: 1,
            sort: 1,
            metadata: {},
          },
        ]),
      } as any
    );
    const warnSpy = vi.spyOn(service.logger, "warn");
    vi.spyOn(service, "pushScript").mockImplementation(async (_fs, script: any) => {
      if (script.uuid === "bad") {
        throw new FileSystemError({
          provider: "s3",
          message: "Precondition failed",
          status: 412,
          conflict: true,
        });
      }
      return { "ok.user.js": "ok-user-new" };
    });
    await (service as any).storage.set("file_digest", {
      "bad.user.js": "bad-user-old",
    });

    await service.syncOnce({ ...syncConfig, syncStatus: false }, fs);

    expect(warnSpy).toHaveBeenCalledWith(
      "sync task failed",
      expect.objectContaining({ error: "Precondition failed" }),
      expect.objectContaining({
        errorKind: "conflict",
        files: ["bad.user.js", "bad.meta.json"],
      })
    );
    await expect((service as any).storage.get("file_digest")).resolves.toMatchObject({
      "ok.user.js": "cloud-ok-new",
      "bad.user.js": "bad-user-old",
    });
  });

  it.each([
    {
      title: "typed transient",
      error: new FileSystemError({
        provider: "webdav",
        message: "Service unavailable",
        status: 503,
        retryable: true,
      }),
      expectedKind: "transient",
      expectedMessage: "Service unavailable",
    },
    {
      title: "typed stale snapshot",
      error: new FileSystemError({
        provider: "onedrive",
        message: "File moved",
        status: 404,
        notFound: true,
      }),
      expectedKind: "stale_snapshot",
      expectedMessage: "File moved",
    },
    {
      title: "unsupported",
      error: new Error("unsupported conditional write"),
      expectedKind: "unsupported",
      expectedMessage: "unsupported conditional write",
    },
  ])(
    "单文件同步遇到 $title 错误时应在日志中标记 $expectedKind 分类",
    async ({ error, expectedKind, expectedMessage }) => {
      const fs = createFs({
        list: vi
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              name: "bad.user.js",
              path: "bad.user.js",
              size: 1,
              digest: "cloud-bad-new",
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
          all: vi.fn().mockResolvedValue([
            {
              uuid: "bad",
              name: "bad",
              updatetime: 1,
              createtime: 1,
              status: 1,
              sort: 0,
              metadata: {},
            },
          ]),
        } as any
      );
      const warnSpy = vi.spyOn(service.logger, "warn");
      vi.spyOn(service, "pushScript").mockRejectedValue(error);
      await (service as any).storage.set("file_digest", {
        "bad.user.js": "bad-user-old",
      });

      await service.syncOnce({ ...syncConfig, syncStatus: false }, fs);

      expect(warnSpy).toHaveBeenCalledWith(
        "sync task failed",
        expect.objectContaining({ error: expectedMessage }),
        expect.objectContaining({
          errorKind: expectedKind,
          files: ["bad.user.js", "bad.meta.json"],
        })
      );
      await expect((service as any).storage.get("file_digest")).resolves.toMatchObject({
        "bad.user.js": "bad-user-old",
      });
    }
  );

  it("scriptcat-sync.json 写回失败时仍推进已成功脚本 digest", async () => {
    const fs = createFs({
      list: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            name: "ok.user.js",
            path: "ok.user.js",
            size: 1,
            digest: "cloud-ok-user",
            createtime: 1,
            updatetime: 1,
          },
          {
            name: "ok.meta.json",
            path: "ok.meta.json",
            size: 1,
            digest: "cloud-ok-meta",
            createtime: 1,
            updatetime: 1,
          },
        ]),
      create: vi.fn().mockResolvedValue({
        write: vi.fn().mockRejectedValue(new Error("status write failed")),
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
        all: vi.fn().mockResolvedValue([
          {
            uuid: "ok",
            name: "ok",
            updatetime: 1,
            createtime: 1,
            status: 1,
            sort: 0,
            metadata: {},
          },
        ]),
      } as any
    );
    vi.spyOn(service, "pushScript").mockResolvedValue({
      "ok.user.js": "pushed-ok-user",
      "ok.meta.json": "pushed-ok-meta",
    });

    await service.syncOnce(syncConfig, fs);

    await expect((service as any).storage.get("file_digest")).resolves.toEqual({
      "ok.user.js": "cloud-ok-user",
      "ok.meta.json": "cloud-ok-meta",
    });
  });

  it("pullScript 失败时不推进对应云端 digest", async () => {
    const fs = createFs({
      list: vi
        .fn()
        .mockResolvedValueOnce([
          {
            name: "pull-uuid.user.js",
            path: "pull-uuid.user.js",
            size: 1,
            digest: "cloud-user-new",
            createtime: 1,
            updatetime: 10,
          },
          {
            name: "pull-uuid.meta.json",
            path: "pull-uuid.meta.json",
            size: 1,
            digest: "cloud-meta-new",
            createtime: 1,
            updatetime: 10,
          },
        ])
        .mockResolvedValueOnce([
          {
            name: "pull-uuid.user.js",
            path: "pull-uuid.user.js",
            size: 1,
            digest: "cloud-user-new",
            createtime: 1,
            updatetime: 10,
          },
          {
            name: "pull-uuid.meta.json",
            path: "pull-uuid.meta.json",
            size: 1,
            digest: "cloud-meta-new",
            createtime: 1,
            updatetime: 10,
          },
        ]),
      open: vi.fn().mockResolvedValue({
        read: vi.fn().mockRejectedValue(new Error("read failed")),
      }),
    });
    const service = new SynchronizeService(
      {} as any,
      {} as any,
      {
        installScript: vi.fn().mockResolvedValue(undefined),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        scriptCodeDAO: {},
        all: vi.fn().mockResolvedValue([]),
      } as any
    );
    await (service as any).storage.set("file_digest", {
      "pull-uuid.user.js": "user-old",
      "pull-uuid.meta.json": "meta-old",
    });

    await service.syncOnce({ ...syncConfig, syncStatus: false }, fs);

    await expect((service as any).storage.get("file_digest")).resolves.toEqual({
      "pull-uuid.user.js": "user-old",
      "pull-uuid.meta.json": "meta-old",
    });
  });

  it("批量删除单条云端删除失败时继续处理后续脚本并保留失败 digest", async () => {
    const deleteCalls: string[] = [];
    const fs = createFs({
      delete: vi.fn().mockImplementation(async (path: string) => {
        deleteCalls.push(path);
        if (path === "fail.user.js") {
          throw new Error("delete failed");
        }
      }),
      list: vi.fn().mockResolvedValue([
        {
          name: "fail.user.js",
          path: "fail.user.js",
          size: 1,
          digest: "fail-user-new",
          createtime: 1,
          updatetime: 1,
        },
        {
          name: "fail.meta.json",
          path: "fail.meta.json",
          size: 1,
          digest: "fail-meta-new",
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
      {
        getCloudSync: vi.fn().mockResolvedValue({ ...syncConfig, enable: true, syncDelete: false }),
      } as any,
      {
        scriptCodeDAO: {},
        all: vi.fn().mockResolvedValue([]),
      } as any
    );
    vi.spyOn(service as any, "buildFileSystem").mockResolvedValue(fs);
    const warnSpy = vi.spyOn(service.logger, "warn");
    await (service as any).storage.set("file_digest", {
      "fail.user.js": "fail-user-old",
      "fail.meta.json": "fail-meta-old",
    });

    await service.scriptsDelete([{ uuid: "fail", deleteBy: "user" } as any, { uuid: "ok", deleteBy: "user" } as any]);
    await stackAsyncTask("cloud_sync_queue", async () => "barrier");

    expect(deleteCalls).toEqual(["fail.user.js", "ok.user.js", "ok.meta.json"]);
    expect(warnSpy).toHaveBeenCalledWith(
      "delete cloud script item failed",
      expect.objectContaining({ error: "delete failed" }),
      expect.objectContaining({ uuid: "fail", errorKind: "fatal" })
    );
    await expect((service as any).storage.get("file_digest")).resolves.toEqual({
      "fail.user.js": "fail-user-old",
      "fail.meta.json": "fail-meta-old",
    });
  });

  it.each([
    {
      title: "transient",
      error: new FileSystemError({
        provider: "webdav",
        message: "Service unavailable",
        status: 503,
        retryable: true,
      }),
      expectedKind: "transient",
      expectedMessage: "Service unavailable",
    },
    {
      title: "conflict",
      error: new FileSystemError({
        provider: "s3",
        message: "Precondition failed",
        status: 412,
        conflict: true,
      }),
      expectedKind: "conflict",
      expectedMessage: "Precondition failed",
    },
  ])(
    "批量删除遇到 typed $title 失败时只阻塞对应脚本并标记 $expectedKind",
    async ({ error, expectedKind, expectedMessage }) => {
      const deleteCalls: string[] = [];
      const fs = createFs({
        delete: vi.fn().mockImplementation(async (path: string) => {
          deleteCalls.push(path);
          if (path === "fail.user.js") {
            throw error;
          }
        }),
        list: vi.fn().mockResolvedValue([
          {
            name: "fail.user.js",
            path: "fail.user.js",
            size: 1,
            digest: "fail-user-new",
            createtime: 1,
            updatetime: 1,
          },
          {
            name: "fail.meta.json",
            path: "fail.meta.json",
            size: 1,
            digest: "fail-meta-new",
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
        {
          getCloudSync: vi.fn().mockResolvedValue({ ...syncConfig, enable: true, syncDelete: false }),
        } as any,
        {
          scriptCodeDAO: {},
          all: vi.fn().mockResolvedValue([]),
        } as any
      );
      vi.spyOn(service as any, "buildFileSystem").mockResolvedValue(fs);
      const warnSpy = vi.spyOn(service.logger, "warn");
      await (service as any).storage.set("file_digest", {
        "fail.user.js": "fail-user-old",
        "fail.meta.json": "fail-meta-old",
      });

      await service.scriptsDelete([{ uuid: "fail", deleteBy: "user" } as any, { uuid: "ok", deleteBy: "user" } as any]);
      await stackAsyncTask("cloud_sync_queue", async () => "barrier");

      expect(deleteCalls).toEqual(["fail.user.js", "ok.user.js", "ok.meta.json"]);
      expect(warnSpy).toHaveBeenCalledWith(
        "delete cloud script item failed",
        expect.objectContaining({ error: expectedMessage }),
        expect.objectContaining({ uuid: "fail", errorKind: expectedKind })
      );
      await expect((service as any).storage.get("file_digest")).resolves.toEqual({
        "fail.user.js": "fail-user-old",
        "fail.meta.json": "fail-meta-old",
      });
    }
  );

  it("deleteCloudScript 支持条件删除时应当传 expectedDigest", async () => {
    const fs = createFs({
      capabilities: {
        supportsConditionalDelete: true,
      },
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
    await (service as any).storage.set("file_digest", {
      "delete-uuid.user.js": "old-user-digest",
      "delete-uuid.meta.json": "old-meta-digest",
    });

    await service.deleteCloudScript(fs, "delete-uuid", false);

    expect(fs.delete).toHaveBeenCalledWith(
      "delete-uuid.user.js",
      expect.objectContaining({ expectedDigest: "old-user-digest" })
    );
    expect(fs.delete).toHaveBeenCalledWith(
      "delete-uuid.meta.json",
      expect.objectContaining({ expectedDigest: "old-meta-digest" })
    );
  });

  it("deleteCloudScript 无条件删除能力时不应传 expectedDigest", async () => {
    const fs = createFs();
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
    await (service as any).storage.set("file_digest", {
      "delete-uuid.user.js": "old-user-digest",
      "delete-uuid.meta.json": "old-meta-digest",
    });

    await service.deleteCloudScript(fs, "delete-uuid", false);

    expect((fs.delete as any).mock.calls[0]).toEqual(["delete-uuid.user.js"]);
    expect((fs.delete as any).mock.calls[1]).toEqual(["delete-uuid.meta.json"]);
  });

  it("passes script modifiedDate when pushing script and meta files", async () => {
    const writeMock = vi.fn().mockResolvedValue(undefined);
    const createMock = vi.fn().mockResolvedValue({ write: writeMock });
    const fs = createFs({
      create: createMock,
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
        all: vi.fn().mockResolvedValue([]),
      } as any
    );
    const script = {
      uuid: "push-uuid",
      name: "push",
      origin: "origin",
      downloadUrl: "download-url",
      checkUpdateUrl: "check-update-url",
      updatetime: 1234,
      createtime: 1000,
      status: 1,
      sort: 0,
      metadata: {},
    };

    await service.pushScript(fs, script as any);

    expect(createMock.mock.calls[0]).toEqual(["push-uuid.user.js", { modifiedDate: 1234 }]);
    expect(createMock.mock.calls[1]).toEqual(["push-uuid.meta.json", { modifiedDate: 1234 }]);
  });

  it("uses Date.now as modifiedDate when writing scriptcat-sync.json", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(9876);
    const createMock = vi.fn().mockResolvedValue({
      write: vi.fn().mockResolvedValue(undefined),
    });
    const fs = createFs({
      create: createMock,
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

    try {
      await service.syncOnce(syncConfig, fs);

      expect(createMock).toHaveBeenCalledWith("scriptcat-sync.json", {
        modifiedDate: 9876,
      });
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("uses Date.now as modifiedDate when writing delete tombstone meta", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(6789);
    const createMock = vi.fn().mockResolvedValue({
      write: vi.fn().mockResolvedValue(undefined),
    });
    const fs = createFs({
      create: createMock,
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

    try {
      await service.deleteCloudScript(fs, "delete-uuid", true);

      expect(createMock).toHaveBeenCalledWith("delete-uuid.meta.json", {
        modifiedDate: 6789,
      });
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("preserves cloud-native digest and does not overwrite with pushed md5", async () => {
    // 各后端 digest 格式不一致（webdav/onedrive 是 etag、dropbox 是 content_hash 等），
    // 上传后再次 list 已经能拿到原生 digest 时，必须保留它，不能被本地 md5 覆盖，
    // 否则下次同步比对会因格式不一致而把未变动的脚本判定为已变动并触发不必要的拉取/推送
    const scriptCode = "// code";
    const script = {
      uuid: "push-uuid",
      name: "push",
      origin: "origin",
      downloadUrl: "download-url",
      checkUpdateUrl: "check-update-url",
      updatetime: 1,
      createtime: 1,
      status: 1,
      sort: 0,
      metadata: {},
    };
    const cloudListAfterPush = [
      { name: "push-uuid.user.js", digest: "etag-user-js", updatetime: 1 },
      { name: "push-uuid.meta.json", digest: "etag-meta-json", updatetime: 1 },
    ];
    const fs = createFs({
      list: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(cloudListAfterPush),
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
          get: vi.fn().mockResolvedValue({ code: scriptCode }),
        },
        all: vi.fn().mockResolvedValue([script]),
      } as any
    );

    await service.syncOnce({ ...syncConfig, syncStatus: false }, fs);

    await expect((service as any).storage.get("file_digest")).resolves.toEqual({
      "push-uuid.user.js": "etag-user-js",
      "push-uuid.meta.json": "etag-meta-json",
    });
  });

  it("scriptInstall enters cloud_sync queue and updates digest after push", async () => {
    let releaseSync!: () => void;
    const syncGate = new Promise<void>((resolve) => {
      releaseSync = resolve;
    });
    const order: string[] = [];

    // 第一个占用队列的 syncOnce，gate 在 updateFileDigest 阶段
    const syncFs = createFs({
      list: vi
        .fn()
        .mockImplementationOnce(async () => {
          order.push("sync:list");
          return [];
        })
        .mockImplementationOnce(async () => {
          order.push("sync:digest");
          await syncGate;
          return [];
        }),
    });

    const installFs = createFs();
    const service = new SynchronizeService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        getCloudSync: vi.fn().mockResolvedValue({ ...syncConfig, enable: true }),
      } as any,
      {
        scriptCodeDAO: {},
        all: vi.fn().mockResolvedValue([]),
      } as any
    );

    vi.spyOn(service as any, "buildFileSystem").mockResolvedValue(installFs);
    vi.spyOn(service, "pushScript").mockImplementation(async () => {
      order.push("install:push");
      return {};
    });
    const realUpdateDigest = service.updateFileDigest.bind(service);
    vi.spyOn(service, "updateFileDigest").mockImplementation(async (fs) => {
      if (fs === installFs) {
        order.push("install:digest");
        return;
      }
      await realUpdateDigest(fs);
    });

    const syncPromise = service.syncOnce(syncConfig, syncFs);
    await flushMicrotasks();
    expect(order).toEqual(["sync:list", "sync:digest"]);

    await service.scriptInstall({
      script: { uuid: "u1", name: "t" } as any,
      upsertBy: "user",
    } as any);
    await flushMicrotasks();

    // syncOnce 还没释放，install 的 pushScript 不能跑
    expect(order).toEqual(["sync:list", "sync:digest"]);

    releaseSync();
    await syncPromise;

    // 在同一队列上排一个 barrier，barrier 完成意味着 install 任务也已完成
    await stackAsyncTask("cloud_sync_queue", async () => "barrier");

    expect(order).toEqual(["sync:list", "sync:digest", "install:push", "install:digest"]);
  });

  it("scriptInstall 触发 push transient 失败时不污染 file_digest", async () => {
    const fs = createFs();
    const service = new SynchronizeService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        getCloudSync: vi.fn().mockResolvedValue({ ...syncConfig, enable: true }),
      } as any,
      {
        scriptCodeDAO: {},
        all: vi.fn().mockResolvedValue([]),
      } as any
    );
    const transientError = new FileSystemError({
      provider: "webdav",
      message: "Service unavailable",
      status: 503,
      retryable: true,
    });
    vi.spyOn(service as any, "buildFileSystem").mockResolvedValue(fs);
    vi.spyOn(service, "pushScript").mockRejectedValue(transientError);
    const updateSpy = vi.spyOn(service, "updateFileDigest");
    const errorSpy = vi.spyOn(service.logger, "error").mockImplementation(() => undefined as any);
    await (service as any).storage.set("file_digest", {
      "install-uuid.user.js": "old-user-digest",
      "install-uuid.meta.json": "old-meta-digest",
    });

    await service.scriptInstall({
      script: { uuid: "install-uuid", name: "install" } as any,
      upsertBy: "user",
    } as any);
    await stackAsyncTask("cloud_sync_queue", async () => "barrier");

    expect(updateSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      "push script on install error",
      expect.objectContaining({ error: "Service unavailable" }),
      expect.objectContaining({ errorKind: "transient" })
    );
    await expect((service as any).storage.get("file_digest")).resolves.toEqual({
      "install-uuid.user.js": "old-user-digest",
      "install-uuid.meta.json": "old-meta-digest",
    });
  });

  it("scriptsDelete enters cloud_sync queue and updates digest after deleting", async () => {
    let releaseSync!: () => void;
    const syncGate = new Promise<void>((resolve) => {
      releaseSync = resolve;
    });
    const order: string[] = [];

    const syncFs = createFs({
      list: vi
        .fn()
        .mockImplementationOnce(async () => {
          order.push("sync:list");
          return [];
        })
        .mockImplementationOnce(async () => {
          order.push("sync:digest");
          await syncGate;
          return [];
        }),
    });

    const deleteFs = createFs();
    const service = new SynchronizeService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        getCloudSync: vi.fn().mockResolvedValue({ ...syncConfig, enable: true }),
      } as any,
      {
        scriptCodeDAO: {},
        all: vi.fn().mockResolvedValue([]),
      } as any
    );

    vi.spyOn(service as any, "buildFileSystem").mockResolvedValue(deleteFs);
    vi.spyOn(service, "deleteCloudScript").mockImplementation(async (_fs: any, uuid: string) => {
      order.push(`delete:${uuid}`);
    });
    const realUpdateDigest = service.updateFileDigest.bind(service);
    vi.spyOn(service, "updateFileDigest").mockImplementation(async (fs) => {
      if (fs === deleteFs) {
        order.push("delete:digest");
        return;
      }
      await realUpdateDigest(fs);
    });

    const syncPromise = service.syncOnce(syncConfig, syncFs);
    await flushMicrotasks();
    expect(order).toEqual(["sync:list", "sync:digest"]);

    await service.scriptsDelete([
      { uuid: "from-user", deleteBy: "user" } as any,
      { uuid: "from-sync", deleteBy: "sync" } as any,
    ]);
    await flushMicrotasks();

    // syncOnce 还没释放，delete 任务一步都不能跑
    expect(order).toEqual(["sync:list", "sync:digest"]);

    releaseSync();
    await syncPromise;
    await stackAsyncTask("cloud_sync_queue", async () => "barrier");

    // deleteBy === "sync" 的不应触发云端删除；并且 digest 必须在删除全部完成后才更新
    expect(order).toEqual(["sync:list", "sync:digest", "delete:from-user", "delete:digest"]);
  });

  it("scriptsDelete skips enqueue when all entries are deleteBy=sync", async () => {
    const service = new SynchronizeService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        getCloudSync: vi.fn().mockResolvedValue({ ...syncConfig, enable: true }),
      } as any,
      {
        scriptCodeDAO: {},
        all: vi.fn().mockResolvedValue([]),
      } as any
    );

    const buildSpy = vi.spyOn(service as any, "buildFileSystem");
    const getCloudSyncSpy = (service as any).systemConfig.getCloudSync as ReturnType<typeof vi.fn>;

    await service.scriptsDelete([{ uuid: "a", deleteBy: "sync" } as any, { uuid: "b", deleteBy: "sync" } as any]);
    await flushMicrotasks();

    // 全部来源是 sync（来自 syncOnce 内部的 deleteScript 回灌），应直接 return
    // 不应去读取云同步配置，也不应建立任何文件系统连接
    expect(getCloudSyncSpy).not.toHaveBeenCalled();
    expect(buildSpy).not.toHaveBeenCalled();
  });

  it("cloudSyncConfigChange swallows buildFileSystem error", async () => {
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

    const buildErr = new Error("build fs failed");
    vi.spyOn(service as any, "buildFileSystem").mockRejectedValue(buildErr);
    const errorSpy = vi.spyOn(service.logger, "error").mockImplementation(() => undefined as any);
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    try {
      service.cloudSyncConfigChange({ ...syncConfig, enable: true });
      await flushMicrotasks();

      expect(errorSpy).toHaveBeenCalledWith("cloud sync config change error", expect.anything());
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});
