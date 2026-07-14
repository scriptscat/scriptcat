import { describe, it, expect, vi, beforeEach } from "vitest";
import { SynchronizeService } from "./synchronize";
import { initTestEnv } from "@Tests/utils";
import type FileSystem from "@Packages/filesystem/filesystem";
import { FileSystemError } from "@Packages/filesystem/error";
import type { CloudSyncConfig } from "@App/pkg/config/config";
import { stackAsyncTask } from "@App/pkg/utils/async_queue";
import { md5OfText } from "@App/pkg/utils/crypto";
import FileSystemFactory from "@Packages/filesystem/factory";
import { AgentModelRepo } from "@App/app/repo/agent_model";
import ChromeStorage from "@App/pkg/config/chrome_storage";

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
    chrome.storage.sync?.clear?.();
  });

  it("下载 API 失败时仍返回手动下载所需的信息", async () => {
    const service = new SynchronizeService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );
    vi.spyOn(service, "backup").mockResolvedValue(undefined);
    const createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:scriptcat-backup");
    const downloadSpy = vi.spyOn(chrome.downloads, "download").mockRejectedValue(new Error("API unavailable"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const result = await service.requestExport();
      await flushMicrotasks();

      expect(result).toEqual({
        url: "blob:scriptcat-backup",
        filename: expect.stringMatching(/^scriptcat-backup-.*\.zip$/),
      });
      expect(downloadSpy).toHaveBeenCalled();
    } finally {
      createObjectURLSpy.mockRestore();
      downloadSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    }
  });

  it("手动云端备份与本地导出一样包含设置", async () => {
    const service = new SynchronizeService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { scriptCodeDAO: {} } as any
    );
    const backupSpy = vi.spyOn(service, "backup").mockResolvedValue(undefined);
    const cloudFs = createFs({
      openDir: vi
        .fn()
        .mockResolvedValue(
          createFs({ create: vi.fn().mockResolvedValue({ write: vi.fn().mockResolvedValue(undefined) }) })
        ),
    });
    const factorySpy = vi.spyOn(FileSystemFactory, "create").mockResolvedValue(cloudFs);

    try {
      await service.backupToCloud({ type: "webdav", params: {} });
      expect(backupSpy).toHaveBeenCalledWith(expect.anything(), undefined, true);
    } finally {
      factorySpy.mockRestore();
    }
  });

  it("设置备份往返默认模型与摘要模型选择", async () => {
    const service = new SynchronizeService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { scriptCodeDAO: {} } as any
    );
    const modelRepo = new AgentModelRepo();
    await modelRepo.setDefaultModelId("default-model");
    await modelRepo.setSummaryModelId("summary-model");

    const bundle = await service.getConfigBundle();
    expect(bundle.agent.defaultModelId).toBe("default-model");
    expect(bundle.agent.summaryModelId).toBe("summary-model");

    await modelRepo.setDefaultModelId("");
    await modelRepo.setSummaryModelId("");
    await service.restoreConfigBundle(bundle);
    expect(await modelRepo.getDefaultModelId()).toBe("default-model");
    expect(await modelRepo.getSummaryModelId()).toBe("summary-model");
  });

  it("getConfigBundle 产出扁平 systemConfig 且不含本机相关键", async () => {
    const service = new SynchronizeService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { scriptCodeDAO: {} } as any
    );
    // 往 system sync storage 写入 1 个可备份键 + 1 个本机键（language 属 STORAGE_LOCAL_KEYS）
    const sync = new ChromeStorage("system", true);
    await sync.set("menu_expand_num", 8);
    await sync.set("language", "zh-CN");

    const bundle = await service.getConfigBundle();
    expect(bundle.systemConfig).toMatchObject({ menu_expand_num: 8 });
    expect(bundle.systemConfig.language).toBeUndefined();
    expect((bundle.systemConfig as any).sync).toBeUndefined();
  });

  it("restoreConfigBundle 把 systemConfig 键写回 sync storage", async () => {
    const service = new SynchronizeService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { scriptCodeDAO: {} } as any
    );
    await service.restoreConfigBundle({
      version: 1,
      systemConfig: { menu_expand_num: 12 },
      agent: { models: [], mcp: [], tasks: [], defaultModelId: "", summaryModelId: "" },
    });
    const sync = new ChromeStorage("system", true);
    expect(await sync.get("menu_expand_num")).toBe(12);
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
          // 云端文件与本地同版本（digest 一致、更新时间不早于本地），仅同步状态差异，不触发文件推送
          updatetime: 200,
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

  it("写回 scriptcat-sync.json 时远端已删除的 uuid 不应被复活", async () => {
    const initialStatus = { enable: true, sort: 1, updatetime: 100 };
    const writeMock = vi.fn().mockResolvedValue(undefined);
    const fs = createFs({
      list: vi.fn().mockResolvedValue([
        {
          name: "kept-uuid.user.js",
          path: "kept-uuid.user.js",
          size: 1,
          digest: "d",
          createtime: 1,
          updatetime: 1,
        },
        {
          name: "kept-uuid.meta.json",
          path: "kept-uuid.meta.json",
          size: 1,
          digest: "d",
          createtime: 1,
          updatetime: 1,
        },
        {
          name: "scriptcat-sync.json",
          path: "scriptcat-sync.json",
          size: 1,
          digest: "sync-d",
          createtime: 1,
          updatetime: 1,
        },
      ]),
      open: vi
        .fn()
        // initial read: both uuids present
        .mockResolvedValueOnce({
          read: vi.fn().mockResolvedValue(
            JSON.stringify({
              version: "1.0.0",
              status: {
                scripts: {
                  "kept-uuid": initialStatus,
                  "deleted-uuid": initialStatus,
                },
              },
            })
          ),
        })
        // latest re-read: deleted-uuid removed by another device
        .mockResolvedValueOnce({
          read: vi.fn().mockResolvedValue(
            JSON.stringify({
              version: "1.0.0",
              status: { scripts: { "kept-uuid": initialStatus } },
            })
          ),
        }),
      create: vi.fn().mockResolvedValue({ write: writeMock }),
    });
    const service = new SynchronizeService(
      {} as any,
      {} as any,
      { enableScript: vi.fn().mockResolvedValue(undefined) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        scriptCodeDAO: {},
        all: vi.fn().mockResolvedValue([
          {
            uuid: "kept-uuid",
            name: "kept",
            updatetime: 100,
            createtime: 1,
            status: 1,
            sort: 1,
            metadata: {},
          },
        ]),
        update: vi.fn().mockResolvedValue(undefined),
      } as any
    );

    await service.syncOnce(syncConfig, fs);

    const written = JSON.parse(writeMock.mock.calls[0][0] as string);
    expect(written.status.scripts).not.toHaveProperty("deleted-uuid");
    expect(written.status.scripts).toHaveProperty("kept-uuid");
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
          // 云端文件与本地同版本（digest 一致、更新时间不早于本地），仅同步状态差异，不触发文件推送
          updatetime: 200,
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
          // 云端文件与本地同版本（digest 一致、更新时间不早于本地），仅同步状态差异，不触发文件推送
          updatetime: 200,
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

  it("pull 安装时本地 updatetime 应采用云端文件时间，避免下一轮误判本地较新而补偿 push", async () => {
    // prepareScriptByCode 会把 updatetime 置为 Date.now()（必然大于云端文件 mtime）。
    // 若不用云端时间覆盖，下一轮 syncOnce 会把刚拉下来的内容当"本地编辑过"再推回云端；
    // 在 etag 型 provider（WebDAV/OneDrive）上相同内容重写也会换 etag，
    // 两台设备会陷入 pull→push→etag 变化→对端 pull→push 的永久振荡。
    const installScript = vi.fn().mockResolvedValue(undefined);
    const fs = createFs({
      open: vi.fn().mockImplementation(async (file) => ({
        read: vi.fn().mockResolvedValue(
          file.name.endsWith(".user.js")
            ? `// ==UserScript==
// @name Pull Time Test
// @namespace sync-test
// @match https://example.com/*
// ==/UserScript==
console.log("ok");`
            : JSON.stringify({ uuid: "pull-time-uuid" })
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

    await service.pullScript(
      fs,
      {
        script: {
          name: "pull-time-uuid.user.js",
          path: "pull-time-uuid.user.js",
          size: 1,
          digest: "d1",
          createtime: 1,
          updatetime: 12345,
        },
        meta: {
          name: "pull-time-uuid.meta.json",
          path: "pull-time-uuid.meta.json",
          size: 1,
          digest: "d2",
          createtime: 1,
          updatetime: 1,
        },
      },
      undefined
    );

    expect(installScript).toHaveBeenCalledTimes(1);
    expect(installScript).toHaveBeenCalledWith(expect.objectContaining({ updatetime: 12345 }));
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

  it("CAS 冲突时云端内容是本机上次所写则重挂基准重推，收敛自我 412", async () => {
    const script = {
      uuid: "sh-uuid",
      name: "sh",
      origin: "origin",
      downloadUrl: "download-url",
      checkUpdateUrl: "check-update-url",
      updatetime: 20,
      createtime: 1,
      status: 1,
      sort: 0,
      metadata: {},
    };
    const written: { name: string; content: string }[] = [];
    const conflictError = new FileSystemError({
      provider: "webdav",
      message: "precondition failed",
      status: 412,
      conflict: true,
    });
    const fs = createFs({
      capabilities: { supportsAtomicCompareAndSwap: true },
      // 首次用过期基准 d0 做 If-Match → 412（自己上次写入把云端推到了 e1，但 digest 记账失败）
      create: vi.fn().mockImplementation(async (name: string, opts: { expectedDigest?: string }) => {
        if (name === "sh-uuid.user.js" && opts?.expectedDigest === "d0-stale") {
          throw conflictError;
        }
        return {
          write: vi.fn().mockImplementation(async (content: string) => {
            written.push({ name, content });
          }),
        };
      }),
      list: vi.fn().mockResolvedValue([
        { name: "sh-uuid.user.js", path: "sh-uuid.user.js", size: 1, digest: "e1-cloud", createtime: 1, updatetime: 5 },
        {
          name: "sh-uuid.meta.json",
          path: "sh-uuid.meta.json",
          size: 1,
          digest: "m1-cloud",
          createtime: 1,
          updatetime: 5,
        },
      ]),
      open: vi.fn().mockImplementation(async (fileInfo: { name: string }) => ({
        read: vi.fn().mockResolvedValue(fileInfo.name === "sh-uuid.user.js" ? "// cloud-edit-1" : "{}"),
      })),
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
        scriptCodeDAO: { get: vi.fn().mockResolvedValue({ code: "// local-edit-2" }) },
        all: vi.fn().mockResolvedValue([script]),
      } as any
    );
    vi.spyOn(service.logger, "error").mockImplementation(() => undefined as any);
    // 本机上次成功写入云端的内容是 edit-1（digest 记账失败 → file_digest 仍停在 d0）
    await (service as any).storage.set("sync_content_md5", {
      "sh-uuid.user.js": md5OfText("// cloud-edit-1"),
    });

    const result = await service.pushScript(fs as any, script as any, {
      fileDigestMap: { "sh-uuid.user.js": "d0-stale", "sh-uuid.meta.json": "m0-stale" },
    });

    // 首次以过期基准 CAS
    expect(fs.create).toHaveBeenCalledWith("sh-uuid.user.js", expect.objectContaining({ expectedDigest: "d0-stale" }));
    // 识别为自我所写后以云端当前 digest 重挂基准重推
    expect(fs.create).toHaveBeenCalledWith("sh-uuid.user.js", expect.objectContaining({ expectedDigest: "e1-cloud" }));
    // 重推的是本机当前内容 edit-2
    expect(written).toContainEqual({ name: "sh-uuid.user.js", content: "// local-edit-2" });
    expect(result["sh-uuid.user.js"]).toBe(md5OfText("// local-edit-2"));
  });

  it("CAS 冲突时云端内容非本机所写则维持停在冲突，不重推覆盖他端", async () => {
    const script = {
      uuid: "cf-uuid",
      name: "cf",
      origin: "origin",
      downloadUrl: "download-url",
      checkUpdateUrl: "check-update-url",
      updatetime: 20,
      createtime: 1,
      status: 1,
      sort: 0,
      metadata: {},
    };
    const conflictError = new FileSystemError({
      provider: "webdav",
      message: "precondition failed",
      status: 412,
      conflict: true,
    });
    const create = vi.fn().mockImplementation(async (name: string, opts: { expectedDigest?: string }) => {
      if (name === "cf-uuid.user.js" && opts?.expectedDigest === "d0-stale") {
        throw conflictError;
      }
      return { write: vi.fn().mockResolvedValue(undefined) };
    });
    const fs = createFs({
      capabilities: { supportsAtomicCompareAndSwap: true },
      create,
      list: vi.fn().mockResolvedValue([
        { name: "cf-uuid.user.js", path: "cf-uuid.user.js", size: 1, digest: "eB-cloud", createtime: 1, updatetime: 9 },
        {
          name: "cf-uuid.meta.json",
          path: "cf-uuid.meta.json",
          size: 1,
          digest: "mB-cloud",
          createtime: 1,
          updatetime: 9,
        },
      ]),
      open: vi.fn().mockImplementation(async () => ({
        read: vi.fn().mockResolvedValue("// other-device"),
      })),
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
        scriptCodeDAO: { get: vi.fn().mockResolvedValue({ code: "// local" }) },
        all: vi.fn().mockResolvedValue([script]),
      } as any
    );
    vi.spyOn(service.logger, "error").mockImplementation(() => undefined as any);
    await (service as any).storage.set("sync_content_md5", {
      "cf-uuid.user.js": md5OfText("// my-previous-push"),
    });

    await expect(
      service.pushScript(fs as any, script as any, {
        fileDigestMap: { "cf-uuid.user.js": "d0-stale", "cf-uuid.meta.json": "m0-stale" },
      })
    ).rejects.toThrow();

    // 云端内容不是本机所写 → 不应以其它 digest 重推覆盖他端
    const userDigests = create.mock.calls
      .filter((c: any[]) => c[0] === "cf-uuid.user.js")
      .map((c: any[]) => c[1]?.expectedDigest);
    expect(userDigests).toEqual(["d0-stale"]);
  });

  it("updateFileDigest 全量对账时应清理云端已删除文件的 sync_content_md5，避免只增不删", async () => {
    const fs = createFs({
      list: vi
        .fn()
        .mockResolvedValue([
          { name: "keep.user.js", path: "keep.user.js", size: 1, digest: "d-keep", createtime: 1, updatetime: 1 },
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
      { scriptCodeDAO: { get: vi.fn() }, all: vi.fn().mockResolvedValue([]) } as any
    );
    await (service as any).storage.set("sync_content_md5", {
      "keep.user.js": "md5-keep",
      // 云端已删除（不在 list 快照中），其 sync_content_md5 条目应被清理
      "gone.user.js": "md5-gone",
    });

    await service.updateFileDigest(fs as any);

    await expect((service as any).storage.get("sync_content_md5")).resolves.toEqual({
      "keep.user.js": "md5-keep",
    });
  });

  it("updateFileDigestForUuids 删除本次目标文件时仅清理目标 sync_content_md5，不误删无关条目", async () => {
    // 队列路径未对账整份云端列表，只能按本次目标 uuid 清理，不能全量盖章误删他端窗口内的记录
    const fs = createFs({
      list: vi.fn().mockResolvedValue([]),
    });
    const service = new SynchronizeService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { scriptCodeDAO: { get: vi.fn() }, all: vi.fn() } as any
    );
    await (service as any).storage.set("sync_content_md5", {
      "del-uuid.user.js": "md5-user",
      "del-uuid.meta.json": "md5-meta",
      // 非本次目标且不在 list：不应被队列路径清理
      "other.user.js": "md5-other",
    });

    await service.updateFileDigestForUuids(fs as any, ["del-uuid"]);

    await expect((service as any).storage.get("sync_content_md5")).resolves.toEqual({
      "other.user.js": "md5-other",
    });
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

  it("删除无效 meta 后重传：本轮已确认不存在的文件应走 createOnly 而非过期 digest CAS", async () => {
    // 云端只有普通 .meta.json（无 .user.js）：删除无效 meta 后重传两个文件。
    // 本轮 list 已确认 .user.js 不存在、meta 刚被我们删除，若再拿本地记录的过期 digest
    // 对不存在的文件做 If-Match 必然 412，且失败保留旧 digest 后永不自愈。
    const script = {
      uuid: "remeta-uuid",
      name: "remeta",
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
        supportsCreateOnly: true,
        supportsConditionalDelete: true,
      },
      list: vi
        .fn()
        .mockResolvedValueOnce([
          {
            name: "remeta-uuid.meta.json",
            path: "remeta-uuid.meta.json",
            size: 1,
            digest: "cloud-meta",
            createtime: 1,
            updatetime: 1,
          },
        ])
        .mockResolvedValueOnce([]),
      open: vi.fn().mockResolvedValue({
        read: vi.fn().mockResolvedValue(JSON.stringify({ uuid: "remeta-uuid", origin: "origin" })),
      }),
    } as unknown as Partial<FileSystem>);
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
      "remeta-uuid.user.js": "stale-user-digest",
      "remeta-uuid.meta.json": "stale-meta-digest",
    });

    await service.syncOnce({ ...syncConfig, syncStatus: false }, fs);

    const createCalls = vi.mocked(fs.create).mock.calls;
    const userCall = createCalls.find((c) => c[0] === "remeta-uuid.user.js");
    const metaCall = createCalls.find((c) => c[0] === "remeta-uuid.meta.json");
    expect(userCall?.[1]).toMatchObject({ createOnly: true });
    expect(userCall?.[1]?.expectedDigest).toBeUndefined();
    expect(metaCall?.[1]).toMatchObject({ createOnly: true });
    expect(metaCall?.[1]?.expectedDigest).toBeUndefined();
  });

  it("云端缺 .meta.json 的补传：meta 走 createOnly，.user.js 仍用记录 digest 做 CAS", async () => {
    const script = {
      uuid: "remeta2-uuid",
      name: "remeta2",
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
        supportsCreateOnly: true,
      },
      list: vi
        .fn()
        .mockResolvedValueOnce([
          {
            name: "remeta2-uuid.user.js",
            path: "remeta2-uuid.user.js",
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
      "remeta2-uuid.user.js": "old-user-digest",
      "remeta2-uuid.meta.json": "stale-meta-digest",
    });

    await service.syncOnce({ ...syncConfig, syncStatus: false }, fs);

    const createCalls = vi.mocked(fs.create).mock.calls;
    const userCall = createCalls.find((c) => c[0] === "remeta2-uuid.user.js");
    const metaCall = createCalls.find((c) => c[0] === "remeta2-uuid.meta.json");
    expect(userCall?.[1]).toMatchObject({ expectedDigest: "old-user-digest" });
    expect(metaCall?.[1]).toMatchObject({ createOnly: true });
    expect(metaCall?.[1]?.expectedDigest).toBeUndefined();
  });

  it("云端已确认不存在的新脚本：即便本地残留过期 digest 记录也应走 createOnly", async () => {
    const script = {
      uuid: "fresh-uuid",
      name: "fresh",
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
    await (service as any).storage.set("file_digest", {
      "fresh-uuid.user.js": "stale-user-digest",
      "fresh-uuid.meta.json": "stale-meta-digest",
    });

    await service.syncOnce({ ...syncConfig, syncStatus: false }, fs);

    const createCalls = vi.mocked(fs.create).mock.calls;
    const userCall = createCalls.find((c) => c[0] === "fresh-uuid.user.js");
    const metaCall = createCalls.find((c) => c[0] === "fresh-uuid.meta.json");
    expect(userCall?.[1]).toMatchObject({ createOnly: true });
    expect(userCall?.[1]?.expectedDigest).toBeUndefined();
    expect(metaCall?.[1]).toMatchObject({ createOnly: true });
    expect(metaCall?.[1]?.expectedDigest).toBeUndefined();
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
      await realUpdateDigest(fs);
    });
    vi.spyOn(service, "updateFileDigestForUuids").mockImplementation(async () => {
      order.push("install:digest");
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

  it("scriptInstall 不应把他端已更新但本机未 pull 的文件标成已同步（避免漏 pull）", async () => {
    const installFs = createFs({
      list: vi.fn().mockResolvedValue([
        {
          name: "install-uuid.user.js",
          path: "install-uuid.user.js",
          size: 1,
          digest: "install-user-etag",
          createtime: 1,
          updatetime: 1,
        },
        {
          name: "install-uuid.meta.json",
          path: "install-uuid.meta.json",
          size: 1,
          digest: "install-meta-etag",
          createtime: 1,
          updatetime: 1,
        },
        // 他端已把 other-uuid 更新到 d2/m2，本机尚未 pull
        {
          name: "other-uuid.user.js",
          path: "other-uuid.user.js",
          size: 1,
          digest: "other-user-d2",
          createtime: 1,
          updatetime: 2,
        },
        {
          name: "other-uuid.meta.json",
          path: "other-uuid.meta.json",
          size: 1,
          digest: "other-meta-m2",
          createtime: 1,
          updatetime: 2,
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
        getCloudSync: vi.fn().mockResolvedValue({ ...syncConfig, enable: true }),
      } as any,
      {
        scriptCodeDAO: {},
        all: vi.fn().mockResolvedValue([]),
      } as any
    );
    vi.spyOn(service as any, "buildFileSystem").mockResolvedValue(installFs);
    vi.spyOn(service, "pushScript").mockResolvedValue({
      "install-uuid.user.js": "install-user-md5",
      "install-uuid.meta.json": "install-meta-md5",
    });
    // 本机上次同步 other-uuid 记录的是旧 d1/m1
    await (service as any).storage.set("file_digest", {
      "other-uuid.user.js": "other-user-d1",
      "other-uuid.meta.json": "other-meta-m1",
    });

    await service.scriptInstall({
      script: { uuid: "install-uuid", name: "install" } as any,
      upsertBy: "user",
    } as any);
    await stackAsyncTask("cloud_sync_queue", async () => "barrier");

    const digest = (await (service as any).storage.get("file_digest")) as Record<string, string>;
    // 本次推送的文件应记录云端原生 digest
    expect(digest["install-uuid.user.js"]).toBe("install-user-etag");
    expect(digest["install-uuid.meta.json"]).toBe("install-meta-etag");
    // 他端未 pull 的更新不能被标成已同步，否则下轮 syncOnce 会早退漏 pull
    expect(digest["other-uuid.user.js"]).toBe("other-user-d1");
    expect(digest["other-uuid.meta.json"]).toBe("other-meta-m1");
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
      await realUpdateDigest(fs);
    });
    vi.spyOn(service, "updateFileDigestForUuids").mockImplementation(async () => {
      order.push("delete:digest");
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

  it("scriptInstall 对已同步过的脚本改用 CAS 而非 create-only 上传", async () => {
    // 编辑一个已经同步到云端的脚本会以 upsertBy=user 再次触发 installScript。
    // 云端文件已存在，此时若仍用 create-only 上传必然 412 冲突，本地编辑永远上不了云。
    // 正确行为：凭本地已存的云端 digest 做 CAS 覆盖（expectedDigest），不带 createOnly。
    const createCalls: Array<{ name: string; opts: any }> = [];
    const fs = createFs({
      capabilities: { supportsCreateOnly: true, supportsAtomicCompareAndSwap: true },
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(async (name: string, opts: any) => {
        createCalls.push({ name, opts });
        return { write: vi.fn().mockResolvedValue(undefined) };
      }),
    } as unknown as Partial<FileSystem>);
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
        scriptCodeDAO: {
          get: vi.fn().mockResolvedValue({ code: "// code" }),
        },
        all: vi.fn().mockResolvedValue([]),
      } as any
    );
    vi.spyOn(service as any, "buildFileSystem").mockResolvedValue(fs);
    // 该脚本此前已同步过，本地记录了它的云端 digest
    await (service as any).storage.set("file_digest", {
      "u1.user.js": "etag-user",
      "u1.meta.json": "etag-meta",
    });

    await service.scriptInstall({
      script: { uuid: "u1", name: "t", origin: "", downloadUrl: "", checkUpdateUrl: "" } as any,
      upsertBy: "user",
    } as any);
    // 在同一队列排一个 barrier，barrier 完成意味着 install 任务已完成
    await stackAsyncTask("cloud_sync_queue", async () => "barrier");

    const userJs = createCalls.find((c) => c.name === "u1.user.js");
    const metaJson = createCalls.find((c) => c.name === "u1.meta.json");
    expect(userJs?.opts?.createOnly).toBeUndefined();
    expect(userJs?.opts?.expectedDigest).toBe("etag-user");
    expect(metaJson?.opts?.createOnly).toBeUndefined();
    expect(metaJson?.opts?.expectedDigest).toBe("etag-meta");
  });

  it("本地编辑后即便云端 digest 未变也应推送而非因 digest 相等被跳过", async () => {
    // 云端 digest 只反映云端侧变化，检测不到本地编辑。若脚本本地更新时间已比云端新，
    // 即便 digest 相等也必须上传，否则本地改动永远上不了云（#1）。
    const fs = createFs({
      list: vi
        .fn()
        .mockResolvedValueOnce([
          { name: "u1.user.js", path: "u1.user.js", size: 1, digest: "cu1", createtime: 1, updatetime: 5 },
          { name: "u1.meta.json", path: "u1.meta.json", size: 1, digest: "cm1", createtime: 1, updatetime: 5 },
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
        scriptCodeDAO: {},
        all: vi
          .fn()
          .mockResolvedValue([
            { uuid: "u1", name: "t", updatetime: 20, createtime: 1, status: 1, sort: 0, metadata: {} },
          ]),
      } as any
    );
    await (service as any).storage.set("file_digest", { "u1.user.js": "cu1", "u1.meta.json": "cm1" });
    const pushSpy = vi.spyOn(service, "pushScript").mockResolvedValue({});

    await service.syncOnce({ ...syncConfig, syncStatus: false }, fs);

    expect(pushSpy).toHaveBeenCalledWith(fs, expect.objectContaining({ uuid: "u1" }), expect.anything());
  });

  it("pushScript 在 .meta.json 写入失败时带出已成功写入的 .user.js", async () => {
    // 分两次写 .user.js / .meta.json，前者成功后者失败时要让调用方知道 .user.js 已写成功，
    // 才能只保留失败文件的旧 digest、推进成功文件的 digest，避免永久 CAS 冲突（#3）。
    const fs = createFs({
      create: vi.fn().mockImplementation(async (name: string) => ({
        write: vi.fn().mockImplementation(async () => {
          if (name === "u1.meta.json") throw new Error("meta write failed");
        }),
      })),
    } as unknown as Partial<FileSystem>);
    const service = new SynchronizeService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        scriptCodeDAO: { get: vi.fn().mockResolvedValue({ code: "// code" }) },
      } as any
    );
    const script = {
      uuid: "u1",
      name: "t",
      origin: "",
      downloadUrl: "",
      checkUpdateUrl: "",
      updatetime: 5,
      createtime: 1,
      status: 1,
      sort: 0,
      metadata: {},
    };

    await expect(service.pushScript(fs, script as any)).rejects.toMatchObject({
      writtenFiles: ["u1.user.js"],
    });
  });

  it("新脚本 .meta.json 失败：应推进已成功的 .user.js digest，并在下一轮补传 .meta.json", async () => {
    let failMeta = true;
    let seq = 0;
    const cloud = new Map<string, { digest: string; content: string; updatetime: number }>();
    const cloudFs = createFs({
      capabilities: { supportsCreateOnly: true },
      list: vi.fn(async () =>
        Array.from(cloud, ([name, f]) => ({
          name,
          path: name,
          size: 1,
          digest: f.digest,
          createtime: 1,
          updatetime: f.updatetime,
        }))
      ),
      create: vi.fn(async (name: string, opts: any) => ({
        write: vi.fn(async (content: string) => {
          const existing = cloud.get(name);
          if (opts?.createOnly && existing) {
            throw new FileSystemError({ provider: "webdav", message: "createOnly", status: 412, conflict: true });
          }
          if (failMeta && name === "u1.meta.json") {
            throw new FileSystemError({ provider: "webdav", message: "meta fail", status: 500, retryable: true });
          }
          cloud.set(name, {
            digest: `d${++seq}`,
            content,
            updatetime: opts?.modifiedDate ?? existing?.updatetime ?? 0,
          });
        }),
      })),
    } as unknown as Partial<FileSystem>);
    const service = new SynchronizeService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        scriptCodeDAO: { get: vi.fn().mockResolvedValue({ code: "// code" }) },
        all: vi.fn().mockResolvedValue([
          {
            uuid: "u1",
            name: "t",
            origin: "",
            downloadUrl: "",
            checkUpdateUrl: "",
            updatetime: 5,
            createtime: 1,
            status: 1,
            sort: 0,
            metadata: {},
          },
        ]),
      } as any
    );

    // 第一轮：.user.js 成功、.meta.json 失败
    await service.syncOnce({ ...syncConfig, syncStatus: false }, cloudFs);
    expect(cloud.has("u1.user.js")).toBe(true);
    expect(cloud.has("u1.meta.json")).toBe(false);
    const dig1 = (await (service as any).storage.get("file_digest")) as Record<string, string>;
    expect(dig1["u1.user.js"]).toBeDefined(); // 推进已成功文件的 digest
    expect(dig1["u1.meta.json"]).toBeUndefined(); // 失败文件不记录

    // 第二轮：meta 故障恢复，应补传 .meta.json（不因 .user.js digest 相等被当作无变动跳过）
    failMeta = false;
    await service.syncOnce({ ...syncConfig, syncStatus: false }, cloudFs);
    expect(cloud.has("u1.meta.json")).toBe(true);
  });

  it("编辑已同步脚本时 .meta.json 失败，下一轮同步自愈而不陷入永久 CAS 冲突", async () => {
    // 端到端复现 #2+#3+#1：编辑已同步脚本 → scriptInstall 推送，.user.js 成功、.meta.json 失败。
    // 已成功的 .user.js digest 必须被推进，否则下一轮 syncOnce 拿过期 digest 做 CAS 永久 412。
    let failMeta = true;
    const writes: string[] = [];
    let seq = 0;
    const cloud = new Map<string, { digest: string; content: string; updatetime: number }>([
      ["u1.user.js", { digest: "cu1", content: "// v0", updatetime: 5 }],
      ["u1.meta.json", { digest: "cm1", content: "{}", updatetime: 5 }],
    ]);
    const conflict = () =>
      new FileSystemError({ provider: "webdav", message: "CAS conflict", status: 412, conflict: true });
    const cloudFs = createFs({
      capabilities: { supportsCreateOnly: true, supportsAtomicCompareAndSwap: true },
      list: vi.fn(async () =>
        Array.from(cloud, ([name, f]) => ({
          name,
          path: name,
          size: 1,
          digest: f.digest,
          createtime: 1,
          updatetime: f.updatetime,
        }))
      ),
      create: vi.fn(async (name: string, opts: any) => ({
        write: vi.fn(async (content: string) => {
          const existing = cloud.get(name);
          if (opts?.createOnly && existing) throw conflict();
          if (opts?.expectedDigest !== undefined && (!existing || existing.digest !== opts.expectedDigest)) {
            throw conflict();
          }
          if (failMeta && name === "u1.meta.json") throw conflict();
          cloud.set(name, {
            digest: `d${++seq}`,
            content,
            updatetime: opts?.modifiedDate ?? existing?.updatetime ?? 0,
          });
          writes.push(name);
        }),
      })),
    } as unknown as Partial<FileSystem>);

    const service = new SynchronizeService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        getCloudSync: vi.fn().mockResolvedValue({ ...syncConfig, syncStatus: false, enable: true }),
      } as any,
      {
        scriptCodeDAO: { get: vi.fn().mockResolvedValue({ code: "// v1" }) },
        all: vi.fn().mockResolvedValue([
          {
            uuid: "u1",
            name: "t",
            origin: "",
            downloadUrl: "",
            checkUpdateUrl: "",
            updatetime: 20,
            createtime: 1,
            status: 1,
            sort: 0,
            metadata: {},
          },
        ]),
      } as any
    );
    vi.spyOn(service as any, "buildFileSystem").mockResolvedValue(cloudFs);
    await (service as any).storage.set("file_digest", { "u1.user.js": "cu1", "u1.meta.json": "cm1" });

    // 第一轮：编辑触发 scriptInstall，.user.js 成功、.meta.json 失败
    await service.scriptInstall({
      script: { uuid: "u1", name: "t", origin: "", downloadUrl: "", checkUpdateUrl: "", updatetime: 10 } as any,
      upsertBy: "user",
    } as any);
    await stackAsyncTask("cloud_sync_queue", async () => "barrier");

    expect(writes).toContain("u1.user.js");
    expect(cloud.get("u1.meta.json")!.digest).toBe("cm1");

    // 第二轮：meta 故障恢复，syncOnce 应自愈（成功文件 digest 已推进，CAS 不再永久冲突）
    failMeta = false;
    writes.length = 0;
    await service.syncOnce({ ...syncConfig, syncStatus: false }, cloudFs);

    expect(writes).toContain("u1.user.js");
    expect(writes).toContain("u1.meta.json");
  });

  it("本地编辑经 syncOnce 真实上云，且推进 digest 后下一轮不再重复推送", async () => {
    // 端到端验证 #1：脚本已同步（云端 digest 与本地记录一致），随后本地编辑（updatetime 变新、
    // 但云端文件未变故 digest 仍相等）。syncOnce 必须真正把新内容 CAS 覆盖上云；
    // 且推进 digest/更新时间后，下一轮应回到稳态不再重复推送。
    let seq = 0;
    const cloud = new Map<string, { digest: string; content: string; updatetime: number }>([
      ["u1.user.js", { digest: "cu1", content: "// v1", updatetime: 5 }],
      ["u1.meta.json", { digest: "cm1", content: "{}", updatetime: 5 }],
    ]);
    const writes: string[] = [];
    const cloudFs = createFs({
      capabilities: { supportsAtomicCompareAndSwap: true },
      list: vi.fn(async () =>
        Array.from(cloud, ([name, f]) => ({
          name,
          path: name,
          size: 1,
          digest: f.digest,
          createtime: 1,
          updatetime: f.updatetime,
        }))
      ),
      create: vi.fn(async (name: string, opts: any) => ({
        write: vi.fn(async (content: string) => {
          const existing = cloud.get(name);
          if (opts?.expectedDigest !== undefined && (!existing || existing.digest !== opts.expectedDigest)) {
            throw new FileSystemError({ provider: "webdav", message: "CAS conflict", status: 412, conflict: true });
          }
          cloud.set(name, {
            digest: `d${++seq}`,
            content,
            updatetime: opts?.modifiedDate ?? existing?.updatetime ?? 0,
          });
          writes.push(name);
        }),
      })),
    } as unknown as Partial<FileSystem>);
    const service = new SynchronizeService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        scriptCodeDAO: { get: vi.fn().mockResolvedValue({ code: "// v2" }) },
        all: vi.fn().mockResolvedValue([
          {
            uuid: "u1",
            name: "t",
            origin: "",
            downloadUrl: "",
            checkUpdateUrl: "",
            updatetime: 20,
            createtime: 1,
            status: 1,
            sort: 0,
            metadata: {},
          },
        ]),
      } as any
    );
    await (service as any).storage.set("file_digest", { "u1.user.js": "cu1", "u1.meta.json": "cm1" });

    // 本地编辑（updatetime 20 > 云端 5，digest 仍相等）→ 应真正把 // v2 覆盖上云
    await service.syncOnce({ ...syncConfig, syncStatus: false }, cloudFs);
    expect(cloud.get("u1.user.js")!.content).toBe("// v2");

    // 下一轮：digest 与更新时间已推进，稳态不再重复推送
    writes.length = 0;
    await service.syncOnce({ ...syncConfig, syncStatus: false }, cloudFs);
    expect(writes).toEqual([]);
  });

  it("云端已变而本地内容未变时，即使本地时间戳更大也应 pull 而非 push（同秒竞态 L4）", async () => {
    // 本地 updatetime 是客户端毫秒时钟，云端 mtime 是服务端整秒时钟，两者不可比：
    // 对端更新落在同一秒时，毫秒余数会让本地"看起来更新"而误走 push。
    // 方向判定应基于内容基线：云端 digest 已变、本地内容自上次同步未变 → pull。
    const fs = createFs({
      list: vi.fn().mockResolvedValue([
        { name: "u1.user.js", path: "u1.user.js", size: 1, digest: "cu2", createtime: 1, updatetime: 5000 },
        { name: "u1.meta.json", path: "u1.meta.json", size: 1, digest: "cm2", createtime: 1, updatetime: 5000 },
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
        scriptCodeDAO: { get: vi.fn().mockResolvedValue({ code: "// code" }) },
        all: vi
          .fn()
          .mockResolvedValue([
            { uuid: "u1", name: "t", updatetime: 5497, createtime: 1, status: 1, sort: 0, metadata: {} },
          ]),
      } as any
    );
    await (service as any).storage.set("file_digest", { "u1.user.js": "cu1", "u1.meta.json": "cm1" });
    await (service as any).storage.set("sync_content_md5", { "u1.user.js": md5OfText("// code") });
    const pushSpy = vi.spyOn(service, "pushScript").mockResolvedValue({});
    const pullSpy = vi.spyOn(service, "pullScript").mockResolvedValue(undefined);

    await service.syncOnce({ ...syncConfig, syncStatus: false }, fs);

    expect(pullSpy).toHaveBeenCalledWith(fs, expect.anything(), undefined, expect.objectContaining({ uuid: "u1" }));
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("本地与云端都已修改时不自动覆盖任何一端：保留旧 digest 并通知一次", async () => {
    const fs = createFs({
      list: vi.fn().mockResolvedValue([
        { name: "u1.user.js", path: "u1.user.js", size: 1, digest: "cu2", createtime: 1, updatetime: 5000 },
        { name: "u1.meta.json", path: "u1.meta.json", size: 1, digest: "cm2", createtime: 1, updatetime: 5000 },
      ]),
      open: vi.fn().mockImplementation(async () => ({
        read: vi.fn().mockResolvedValue("// cloud edit"),
      })),
    });
    const notificationSpy = vi.spyOn(chrome.notifications, "create");
    const service = new SynchronizeService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        scriptCodeDAO: { get: vi.fn().mockResolvedValue({ code: "// local edit" }) },
        all: vi
          .fn()
          .mockResolvedValue([
            { uuid: "u1", name: "t", updatetime: 5497, createtime: 1, status: 1, sort: 0, metadata: {} },
          ]),
      } as any
    );
    await (service as any).storage.set("file_digest", { "u1.user.js": "cu1", "u1.meta.json": "cm1" });
    await (service as any).storage.set("sync_content_md5", { "u1.user.js": md5OfText("// base") });
    const pushSpy = vi.spyOn(service, "pushScript").mockResolvedValue({});
    const pullSpy = vi.spyOn(service, "pullScript").mockResolvedValue(undefined);

    await service.syncOnce({ ...syncConfig, syncStatus: false }, fs);

    expect(pushSpy).not.toHaveBeenCalled();
    expect(pullSpy).not.toHaveBeenCalled();
    expect(notificationSpy).toHaveBeenCalledTimes(1);
    // 冲突文件保留旧 digest，下一轮仍能识别云端变化
    await expect((service as any).storage.get("file_digest")).resolves.toMatchObject({
      "u1.user.js": "cu1",
      "u1.meta.json": "cm1",
    });
  });

  it("同一批冲突脚本多轮同步只通知一次，冲突消失后重置", async () => {
    const fs = createFs({
      list: vi.fn().mockResolvedValue([
        { name: "u1.user.js", path: "u1.user.js", size: 1, digest: "cu2", createtime: 1, updatetime: 5000 },
        { name: "u1.meta.json", path: "u1.meta.json", size: 1, digest: "cm2", createtime: 1, updatetime: 5000 },
      ]),
      open: vi.fn().mockImplementation(async () => ({
        read: vi.fn().mockResolvedValue("// cloud edit"),
      })),
    });
    const notificationSpy = vi.spyOn(chrome.notifications, "create");
    const service = new SynchronizeService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        scriptCodeDAO: { get: vi.fn().mockResolvedValue({ code: "// local edit" }) },
        all: vi
          .fn()
          .mockResolvedValue([
            { uuid: "u1", name: "t", updatetime: 5497, createtime: 1, status: 1, sort: 0, metadata: {} },
          ]),
      } as any
    );
    await (service as any).storage.set("file_digest", { "u1.user.js": "cu1", "u1.meta.json": "cm1" });
    await (service as any).storage.set("sync_content_md5", { "u1.user.js": md5OfText("// base") });
    vi.spyOn(service, "pushScript").mockResolvedValue({});
    vi.spyOn(service, "pullScript").mockResolvedValue(undefined);

    await service.syncOnce({ ...syncConfig, syncStatus: false }, fs);
    await service.syncOnce({ ...syncConfig, syncStatus: false }, fs);

    expect(notificationSpy).toHaveBeenCalledTimes(1);
  });

  it("云端已变但内容与本地一致时直接收敛基线，不 push 不 pull 不通知", async () => {
    // 两台设备做了同样的编辑（或本机记账失败后云端内容实为本机所写）：
    // 内容一致只是基线过期，采用云端 digest 收敛即可，不算冲突
    const fs = createFs({
      list: vi.fn().mockResolvedValue([
        { name: "u1.user.js", path: "u1.user.js", size: 1, digest: "cu2", createtime: 1, updatetime: 5000 },
        { name: "u1.meta.json", path: "u1.meta.json", size: 1, digest: "cm2", createtime: 1, updatetime: 5000 },
      ]),
      open: vi.fn().mockImplementation(async () => ({
        read: vi.fn().mockResolvedValue("// same edit"),
      })),
    });
    const notificationSpy = vi.spyOn(chrome.notifications, "create");
    const service = new SynchronizeService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        scriptCodeDAO: { get: vi.fn().mockResolvedValue({ code: "// same edit" }) },
        all: vi
          .fn()
          .mockResolvedValue([
            { uuid: "u1", name: "t", updatetime: 5497, createtime: 1, status: 1, sort: 0, metadata: {} },
          ]),
      } as any
    );
    await (service as any).storage.set("file_digest", { "u1.user.js": "cu1", "u1.meta.json": "cm1" });
    await (service as any).storage.set("sync_content_md5", { "u1.user.js": md5OfText("// base") });
    const pushSpy = vi.spyOn(service, "pushScript").mockResolvedValue({});
    const pullSpy = vi.spyOn(service, "pullScript").mockResolvedValue(undefined);

    await service.syncOnce({ ...syncConfig, syncStatus: false }, fs);

    expect(pushSpy).not.toHaveBeenCalled();
    expect(pullSpy).not.toHaveBeenCalled();
    expect(notificationSpy).not.toHaveBeenCalled();
    // digest 与内容基线一并推进，下一轮回到稳态
    await expect((service as any).storage.get("file_digest")).resolves.toMatchObject({
      "u1.user.js": "cu2",
      "u1.meta.json": "cm2",
    });
    await expect((service as any).storage.get("sync_content_md5")).resolves.toMatchObject({
      "u1.user.js": md5OfText("// same edit"),
    });
  });

  it("无本地内容基线时退回时间比较决定方向（升级兼容）", async () => {
    const fs = createFs({
      list: vi.fn().mockResolvedValue([
        { name: "u1.user.js", path: "u1.user.js", size: 1, digest: "cu2", createtime: 1, updatetime: 5 },
        { name: "u1.meta.json", path: "u1.meta.json", size: 1, digest: "cm2", createtime: 1, updatetime: 5 },
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
        scriptCodeDAO: { get: vi.fn().mockResolvedValue({ code: "// code" }) },
        all: vi
          .fn()
          .mockResolvedValue([
            { uuid: "u1", name: "t", updatetime: 20, createtime: 1, status: 1, sort: 0, metadata: {} },
          ]),
      } as any
    );
    await (service as any).storage.set("file_digest", { "u1.user.js": "cu1", "u1.meta.json": "cm1" });
    const pushSpy = vi.spyOn(service, "pushScript").mockResolvedValue({});
    const pullSpy = vi.spyOn(service, "pullScript").mockResolvedValue(undefined);

    await service.syncOnce({ ...syncConfig, syncStatus: false }, fs);

    expect(pushSpy).toHaveBeenCalledWith(fs, expect.objectContaining({ uuid: "u1" }), expect.anything());
    expect(pullSpy).not.toHaveBeenCalled();
  });

  it("pull 成功后记录内容基线，供下轮云端再变时判定本地是否也改过", async () => {
    const installScript = vi.fn().mockResolvedValue(undefined);
    const pulledCode = `// ==UserScript==
// @name Baseline Test
// @namespace sync-test
// @match https://example.com/*
// ==/UserScript==
console.log("ok");`;
    const pulledMeta = JSON.stringify({ uuid: "baseline-uuid" });
    const fs = createFs({
      open: vi.fn().mockImplementation(async (file) => ({
        read: vi.fn().mockResolvedValue(file.name.endsWith(".user.js") ? pulledCode : pulledMeta),
      })),
    });
    const service = new SynchronizeService(
      {} as any,
      {} as any,
      { installScript } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { scriptCodeDAO: {} } as any
    );

    await service.pullScript(
      fs,
      {
        script: {
          name: "baseline-uuid.user.js",
          path: "baseline-uuid.user.js",
          size: 1,
          digest: "d1",
          createtime: 1,
          updatetime: 12345,
        },
        meta: {
          name: "baseline-uuid.meta.json",
          path: "baseline-uuid.meta.json",
          size: 1,
          digest: "d2",
          createtime: 1,
          updatetime: 1,
        },
      },
      undefined
    );

    await expect((service as any).storage.get("sync_content_md5")).resolves.toMatchObject({
      "baseline-uuid.user.js": md5OfText(pulledCode),
      "baseline-uuid.meta.json": md5OfText(pulledMeta),
    });
  });
});
