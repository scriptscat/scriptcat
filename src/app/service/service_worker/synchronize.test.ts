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
    const fs1 = createFs({
      list: vi
        .fn()
        .mockImplementationOnce(async () => {
          order.push("first:start");
          await firstGate;
          order.push("first:end");
          return [];
        })
        .mockResolvedValue([]),
    });
    const fs2 = createFs({
      list: vi
        .fn()
        .mockImplementationOnce(async () => {
          order.push("second:start");
          return [];
        })
        .mockResolvedValue([]),
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
    await Promise.resolve();
    const second = service.syncOnce(syncConfig, fs2);
    await Promise.resolve();

    expect(order).toEqual(["first:start"]);
    expect((fs2.list as any).mock.calls.length).toBe(0);

    releaseFirst();
    await Promise.all([first, second]);

    expect(order).toEqual(["first:start", "first:end", "second:start"]);
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
});
