import { describe, it, expect, vi, beforeEach } from "vitest";
import { SynchronizeService } from "./synchronize";
import { initTestEnv } from "@Tests/utils";
import type FileSystem from "@Packages/filesystem/filesystem";
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
