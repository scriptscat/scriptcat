import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import type { Resource } from "@App/app/repo/resource";
import {
  type Script,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_STATUS_ENABLE,
  type ScriptDAO,
  type ScriptCodeDAO,
} from "@App/app/repo/scripts";
import BackupExport from "@App/pkg/backup/export";
import type { BackupData, ResourceBackup, ScriptBackupData, ScriptOptions, ValueStorage } from "@App/pkg/backup/struct";
import type { FileCreateOptions, FileInfo } from "@Packages/filesystem/filesystem";
import type FileSystem from "@Packages/filesystem/filesystem";
import { getFileSystemCapabilities } from "@Packages/filesystem/filesystem";
import ZipFileSystem from "@Packages/filesystem/zip/zip";
import FileSystemFactory, { type FileSystemType } from "@Packages/filesystem/factory";
import { FileSystemError, isWarpTokenError } from "@Packages/filesystem/error";
import type { Group } from "@Packages/message/server";
import type { MessageSend } from "@Packages/message/types";
import { type IMessageQueue } from "@Packages/message/message_queue";
import { createJSZip } from "@App/pkg/utils/jszip-x";
import { type ValueService } from "./value";
import { type ResourceService } from "./resource";
import { createObjectURL } from "../offscreen/client";
import { type CloudSyncConfig, type SystemConfig } from "@App/pkg/config/config";
import type { TDeleteScript, TInstallScript, TInstallScriptParams } from "../queue";
import { errorMsg, makeBlobURL } from "@App/pkg/utils/utils";
import { t } from "i18next";
import ChromeStorage from "@App/pkg/config/chrome_storage";
import { type ScriptService } from "./script";
import { prepareScriptByCode } from "@App/pkg/utils/script";
import { ExtVersion } from "@App/app/const";
import { dayFormat } from "@App/pkg/utils/day_format";
import i18n, { i18nName } from "@App/locales/locales";
import { InfoNotification } from "./utils";
import { stackAsyncTask } from "@App/pkg/utils/async_queue";
import { md5OfText } from "@App/pkg/utils/crypto";
import { startDownload } from "./download";

// type SynchronizeTarget = "local";

type SyncFiles = {
  script: FileInfo;
  meta: FileInfo;
};

type SyncMeta = {
  uuid: string;
  origin?: string; // 脚本来源
  downloadUrl?: string;
  checkUpdateUrl?: string;
  isDeleted?: boolean;
};

type ScriptcatSync = {
  version: string; // 脚本猫版本
  status: {
    scripts: {
      [key: string]: ScriptcatSyncStatus | undefined;
    };
  };
};

type ScriptcatSyncStatus = {
  enable: boolean;
  sort: number;
  updatetime: number; // 更新时间
};

type PushScriptParam = TInstallScriptParams & Partial<Pick<Script, "createtime" | "updatetime">>;

export type LocalBackupExport = {
  url: string;
  filename: string;
};

type FileDigestMap = {
  [key: string]: string;
};

type PushScriptOptions = {
  fileDigestMap?: FileDigestMap;
  scriptFile?: FileInfo;
  metaFile?: FileInfo;
  // syncOnce 场景为 true：scriptFile/metaFile 反映本轮 fs.list() 快照，undefined 表示已确认云端不存在
  hasListSnapshot?: boolean;
  // 自我 412 收敛的重推标记，避免二次冲突时无限重试
  selfHealRetried?: boolean;
};

type SyncTask = {
  uuid: string;
  promise: Promise<FileDigestMap | void>;
  preserveDigestFiles: string[];
};

type SyncErrorKind = "conflict" | "stale_snapshot" | "transient" | "unsupported" | "fatal";

// pushScript 分两次写 .user.js / .meta.json，前者成功后者失败时抛出本错误，
// 带出已成功写入的文件名，让调用方只保留真正失败文件的旧 digest、推进成功文件的 digest，
// 避免成功文件的 digest 永久变旧后与云端 CAS 永远不匹配（永久 412）。
class PushScriptPartialError extends Error {
  constructor(
    readonly originalError: unknown,
    readonly writtenFiles: string[]
  ) {
    super(originalError instanceof Error ? originalError.message : String(originalError));
    this.name = "PushScriptPartialError";
  }
}

const SYNC_SERVICE_TASK_KEY = "cloud_sync_queue";

function getScriptModifiedDate(script: PushScriptParam): number {
  return script.updatetime || script.createtime || Date.now();
}

export class SynchronizeService {
  logger: Logger;

  scriptCodeDAO: ScriptCodeDAO;

  storage: ChromeStorage = new ChromeStorage("sync", false);

  constructor(
    private msgSender: MessageSend,
    private group: Group,
    private script: ScriptService,
    private value: ValueService,
    private resource: ResourceService,
    private mq: IMessageQueue,
    private systemConfig: SystemConfig,
    private scriptDAO: ScriptDAO
  ) {
    this.logger = LoggerCore.logger().with({ service: "synchronize" });
    this.scriptCodeDAO = this.scriptDAO.scriptCodeDAO;
  }

  // 生成备份文件到文件系统
  async backup(fs: FileSystem, uuids?: string[]) {
    // 生成导出数据
    const data: BackupData = {
      script: await this.getScriptBackupData(uuids),
      subscribe: [],
    };

    await new BackupExport(fs).export(data);
  }

  // 获取脚本备份数据
  async getScriptBackupData(uuids?: string[]) {
    if (uuids) {
      const rets: Promise<ScriptBackupData>[] = [];
      uuids.forEach((uuid) => {
        rets.push(
          this.scriptDAO.get(uuid).then((script) => {
            if (script) {
              return this.generateScriptBackupData(script);
            }
            return Promise.reject(new Error(`Script ${uuid} not found`));
          })
        );
      });
      return Promise.all(rets); // 不处理 Promise.reject ?
    }
    // 获取所有脚本
    const list = await this.scriptDAO.all();
    return Promise.all(list.map((script) => this.generateScriptBackupData(script)));
  }

  async generateScriptBackupData(script: Script): Promise<ScriptBackupData> {
    const code = await this.scriptCodeDAO.get(script.uuid);
    if (!code) {
      throw new Error(`Script ${script.uuid} code not found`);
    }
    const lastModificationDate = script.updatetime || script.createtime || undefined;
    const [values, valueRet] = await this.value.getScriptValueDetails(script);
    const [requires, requiresCss, resources] = await this.resource.getResourceByTypes(script, [
      "require",
      "require-css",
      "resource",
    ]);
    const storage: ValueStorage = {
      data: { ...values },
      ts: valueRet?.updatetime || lastModificationDate || Date.now(),
    };
    const ret = {
      code: code.code,
      options: {
        options: this.scriptOption(script),
        settings: {
          enabled: script.status === SCRIPT_STATUS_ENABLE,
          position: script.sort,
        },
        meta: {
          name: script.name,
          uuid: script.uuid,
          sc_uuid: script.uuid,
          modified: script.updatetime!,
          file_url: script.downloadUrl!,
          subscribe_url: script.subscribeUrl,
        },
      },
      // storage,
      requires: this.resourceToBackdata(requires),
      requiresCss: this.resourceToBackdata(requiresCss),
      resources: this.resourceToBackdata(resources),
      storage,
      lastModificationDate,
    } satisfies ScriptBackupData;

    return ret;
  }

  resourceToBackdata(resource: { [key: string]: Resource }) {
    const ret: ResourceBackup[] = [];
    for (const key of Object.keys(resource)) {
      const resourceValue = resource[key];
      ret.push({
        meta: {
          name: this.getUrlName(resourceValue.url),
          url: resourceValue.url,
          ts: resourceValue.updatetime || resourceValue.createtime,
          mimetype: resourceValue.contentType,
        },
        source: resourceValue.content || undefined,
        base64: resourceValue.base64,
      });
    }
    return ret;
  }

  importResources(data: {
    uuid: string;
    requires: ResourceBackup[];
    resources: ResourceBackup[];
    requiresCss: ResourceBackup[];
  }) {
    const { uuid, requires, resources, requiresCss } = data;
    return Promise.all([
      // 处理requires
      ...requires.map((item) => this.resource.importResource(uuid, item, "require")),
      // 处理resources
      ...resources.map((item) => this.resource.importResource(uuid, item, "resource")),
      // 处理requiresCss
      ...requiresCss.map((item) => this.resource.importResource(uuid, item, "require-css")),
    ]).then(() => {
      return;
    });
  }

  getUrlName(url: string): string {
    let index = url.indexOf("?");
    if (index !== -1) {
      url = url.substring(0, index);
    }
    index = url.lastIndexOf("/");
    if (index !== -1) {
      url = url.substring(index + 1);
    }
    return url;
  }

  // 为了兼容tm
  scriptOption(script: Script): ScriptOptions {
    return {
      check_for_updates: false,
      comment: null,
      compat_foreach: false,
      compat_metadata: false,
      compat_prototypes: false,
      compat_wrappedjsobject: false,
      compatopts_for_requires: true,
      noframes: null,
      override: {
        merge_connects: true,
        merge_excludes: true,
        merge_includes: true,
        merge_matches: true,
        orig_connects: script.metadata.connect || [],
        orig_excludes: script.metadata.exclude || [],
        orig_includes: script.metadata.include || [],
        orig_matches: script.metadata.match || [],
        orig_noframes: script.metadata.noframes ? true : null,
        orig_run_at: (script.metadata.run_at && script.metadata.run_at[0]) || "document-idle",
        use_blockers: [],
        use_connects: [],
        use_excludes: [],
        use_includes: [],
        use_matches: [],
      },
      run_at: null,
    };
  }

  // 请求导出文件
  async requestExport(uuids?: string[]): Promise<LocalBackupExport> {
    const zipFile = createJSZip();
    const fs = new ZipFileSystem(zipFile);
    await this.backup(fs, uuids);
    // 生成文件,并下载
    const zipOutput = await zipFile.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: {
        level: 9,
      },
      comment: "Created by Scriptcat",
    });
    const url = await makeBlobURL({ blob: zipOutput, persistence: false }, (params) =>
      createObjectURL(this.msgSender, params)
    );
    const filename = `scriptcat-backup-${dayFormat(new Date(), "YYYY-MM-DDTHH-mm-ss")}.zip`;
    void startDownload({
      url,
      saveAs: true,
      filename,
    });
    return { url, filename };
  }

  // 备份到云端
  async backupToCloud({ type, params }: { type: FileSystemType; params: any }) {
    // 首先生成zip文件
    const zipFile = createJSZip();
    const fs = new ZipFileSystem(zipFile);
    await this.backup(fs);
    this.logger.info("backup to cloud");
    // 然后创建云端文件系统
    let cloudFs = await FileSystemFactory.create(type, params);
    try {
      await cloudFs.createDir("ScriptCat");
      cloudFs = await cloudFs.openDir("ScriptCat");
      // 云端文件系统写入文件
      const file = await cloudFs.create(`scriptcat-backup-${dayFormat(new Date(), "YYYY-MM-DDTHH-mm-ss")}.zip`);
      await file.write(
        await zipFile.generateAsync({
          type: "blob",
          compression: "DEFLATE",
          compressionOptions: {
            level: 9,
          },
          comment: "Created by Scriptcat",
        })
      );
    } catch (e) {
      this.logger.error("backup to cloud error", Logger.E(e));
      throw e;
    }
    return;
  }

  // 开始一次云同步
  async buildFileSystem(config: CloudSyncConfig) {
    let fs: FileSystem;
    try {
      fs = await FileSystemFactory.create(config.filesystem, config.params[config.filesystem]);
      // 创建base目录
      await FileSystemFactory.mkdirAll(fs, "ScriptCat/sync");
      fs = await fs.openDir("ScriptCat/sync");
    } catch (e: any) {
      this.logger.error("create filesystem error", Logger.E(e), {
        type: config.filesystem,
      });
      // 判断错误是不是网络类型的错误, 网络类型的错误不做任何处理
      // 如果是token失效之类的错误,通知用户并关闭云同步
      if (isWarpTokenError(e)) {
        InfoNotification(
          `${t("settings:sync_system_connect_failed")}, ${t("settings:sync_system_closed")}`,
          `${t("settings:sync_system_closed_description")}\n${errorMsg(e)}`
        );
        this.systemConfig.setCloudSync({
          ...config,
          enable: false,
        });
      }
      throw e;
    }
    return fs;
  }

  // 同步一次
  async syncOnce(syncConfig: CloudSyncConfig, fs: FileSystem) {
    return stackAsyncTask(SYNC_SERVICE_TASK_KEY, async () => {
      try {
        await this.syncOnceInternal(syncConfig, fs);
      } catch (e) {
        this.logger.error("sync once error", Logger.E(e));
      }
    });
  }

  private async syncOnceInternal(syncConfig: CloudSyncConfig, fs: FileSystem) {
    this.logger.info("start sync once");
    // 获取文件列表
    const list = await fs.list();
    // 根据文件名生成一个map
    const uuidMap = new Map<string, Partial<SyncFiles>>();
    // 储存文件摘要,用于检测文件是否有变化
    const fileDigestMap = ((await this.storage.get("file_digest")) as FileDigestMap) || {};

    for (const file of list) {
      if (file.name.endsWith(".user.js")) {
        const uuid = file.name.substring(0, file.name.length - 8);
        let files = uuidMap.get(uuid);
        if (!files) {
          files = {};
          uuidMap.set(uuid, files);
        }
        files.script = file;
      } else if (file.name.endsWith(".meta.json")) {
        const uuid = file.name.substring(0, file.name.length - 10);
        let files = uuidMap.get(uuid);
        if (!files) {
          files = {};
          uuidMap.set(uuid, files);
        }
        files.meta = file;
      }
    }

    // 获取脚本列表
    const scriptList = await this.scriptDAO.all();
    // 遍历脚本列表生成一个map
    const scriptMap = new Map<string, Script>();
    scriptList.forEach((script) => {
      scriptMap.set(script.uuid, script);
    });

    // 判断文件系统是否有脚本猫同步文件
    const file = list.find((file) => file.name === "scriptcat-sync.json");
    const scriptcatSync = {
      version: ExtVersion,
      status: {
        scripts: {},
      },
    } as ScriptcatSync;
    let cloudStatus: ScriptcatSync["status"]["scripts"] = {};
    let canWriteScriptcatSync = true;
    if (file) {
      try {
        // 如果有,则读取文件内容
        const cloudScriptCatSync = JSON.parse(
          await fs.open(file).then((f) => f.read("string"))
        ) as Partial<ScriptcatSync>;
        cloudStatus = cloudScriptCatSync.status?.scripts || {};
      } catch (e) {
        canWriteScriptcatSync = false;
        this.logger.warn("read scriptcat-sync.json file failed", Logger.E(e));
      }
    }

    // 对比脚本列表和文件列表,进行同步
    const result: SyncTask[] = [];
    const updateScript: Map<string, boolean> = new Map();
    // 记录被跳过的孤儿云端脚本（仅 .user.js 无 .meta.json）
    // 避免本机回写 scriptcat-sync.json 时丢失对应 uuid 的云端 status
    const skippedOrphanUuids = new Set<string>();
    let hasNotifiedSyncDelete = false;
    // 需要是同步操作，后续上传剩下的脚本
    // 最后使用 Promise.allSettled 进行等待
    const addSyncTask = (uuid: string, promise: Promise<FileDigestMap | void>, files?: string[]) => {
      result.push({
        uuid,
        promise,
        preserveDigestFiles: files || [`${uuid}.user.js`, `${uuid}.meta.json`],
      });
    };
    uuidMap.forEach((file, uuid) => {
      const script = scriptMap.get(uuid);
      if (script) {
        scriptMap.delete(uuid);
        // 脚本存在但是文件不存在,则读取.meta.json内容判断是否需要删除脚本
        if (!file.script) {
          addSyncTask(
            uuid,
            (async () => {
              // 读取meta文件
              const meta = await fs.open(file.meta!);
              const metaJson = (await meta.read("string")) as string;
              const metaObj = JSON.parse(metaJson) as SyncMeta;
              if (metaObj.isDeleted) {
                // 删除脚本
                await this.script.deleteScript(script.uuid, "sync");
                if (!hasNotifiedSyncDelete) {
                  hasNotifiedSyncDelete = true;
                  InfoNotification(
                    i18n.t("settings:notification.script_sync_delete"),
                    i18n.t("settings:notification.script_sync_delete_desc", {
                      scriptName: i18nName(script),
                    })
                  );
                }
              } else {
                // 否则认为是一个无效的.meta文件，进行删除，并进行同步
                await fs.delete(file.meta!.name);
                return await this.pushScript(fs, script, { fileDigestMap, hasListSnapshot: true });
              }
            })(),
            [file.meta!.name, `${uuid}.user.js`]
          );
          return;
        }
        const updatetime = script.updatetime || script.createtime;
        // 过滤掉无变动的文件：仅当 .meta.json 齐全、云端 digest 与上次同步记录一致、
        // 且本地更新时间不比云端新时，才认为无需处理直接跳过。
        // 否则要么本地编辑过（updatetime 更新，digest 相等只反映云端未变）需上传（#1），
        // 要么云端缺 .meta.json（上一轮分片上传残留）需补传，均不能在此提前跳过。
        if (
          file.meta &&
          fileDigestMap[file.script!.name] === file.script!.digest &&
          updatetime <= file.script!.updatetime
        ) {
          return;
        }
        // 对比脚本更新时间和文件更新时间
        if (updatetime > file.script!.updatetime || !file.meta) {
          // 如果脚本更新时间大于文件更新时间
          // 或者不存在.meta文件,则上传文件
          addSyncTask(
            uuid,
            this.pushScript(fs, script, {
              fileDigestMap,
              scriptFile: file.script,
              metaFile: file.meta,
              hasListSnapshot: true,
            })
          );
        } else {
          // 如果脚本更新时间小于文件更新时间,则更新脚本
          updateScript.set(uuid, true);
          addSyncTask(uuid, this.pullScript(fs, file as SyncFiles, cloudStatus[uuid], script));
        }
        return;
      }
      // 如果脚本不存在，但文件存在，则安装脚本
      if (file.script) {
        if (!file.meta) {
          // .meta 文件可能尚未上传完成，跳过本次以避免误删云端脚本
          this.logger.warn("skip orphan cloud script without meta", {
            uuid,
            file: file.script.name,
          });
          skippedOrphanUuids.add(uuid);
          return;
        }
        updateScript.set(uuid, true);
        addSyncTask(uuid, this.pullScript(fs, file as SyncFiles, cloudStatus[uuid]));
      }
    });
    // 上传剩下的脚本
    scriptMap.forEach((script) => {
      addSyncTask(script.uuid, this.pushScript(fs, script, { fileDigestMap, hasListSnapshot: true }));
    });
    // 忽略错误
    const syncResults = await Promise.allSettled(result.map((item) => item.promise));
    const pushedFileDigestMap: FileDigestMap = {};
    const preserveDigestFiles = new Set<string>();
    const failedSyncUuids = new Set<string>();
    syncResults.forEach((ret, index) => {
      if (ret.status === "fulfilled" && ret.value) {
        Object.assign(pushedFileDigestMap, ret.value);
      } else if (ret.status === "rejected") {
        failedSyncUuids.add(result[index].uuid);
        // 分片上传时已成功写入云端的文件（如 .user.js 成功、.meta.json 失败）不保留旧 digest，
        // 让 updateFileDigest 记录其云端最新 digest，避免成功文件 digest 永久变旧、后续 CAS 永久冲突。
        const writtenFiles = ret.reason instanceof PushScriptPartialError ? ret.reason.writtenFiles : [];
        result[index].preserveDigestFiles.forEach((name) => {
          if (!writtenFiles.includes(name)) {
            preserveDigestFiles.add(name);
          }
        });
        this.logger.warn("sync task failed", Logger.E(ret.reason), {
          errorKind: this.classifySyncError(ret.reason),
          files: result[index].preserveDigestFiles,
        });
      }
    });
    // 同步状态
    if (syncConfig.syncStatus && canWriteScriptcatSync) {
      try {
        const scriptlist = await this.scriptDAO.all();
        await Promise.allSettled(
          scriptlist.map(async (script) => {
            if (failedSyncUuids.has(script.uuid)) {
              scriptcatSync.status.scripts[script.uuid] = cloudStatus[script.uuid];
              return;
            }
            // 判断云端状态是否与本地状态一致
            const status = cloudStatus[script.uuid];
            const updatetime = script.updatetime || script.createtime;
            if (!status) {
              scriptcatSync.status.scripts[script.uuid] = {
                enable: script.status === SCRIPT_STATUS_ENABLE,
                sort: script.sort,
                updatetime: updatetime,
              };
            } else {
              if (updateScript.has(script.uuid)) {
                // 脚本已经更新过了,跳过状态同步
                scriptcatSync.status.scripts[script.uuid] = status;
                return;
              }
              // 判断时间
              // 如果云端状态的更新时间小于本地状态的更新时间,则更新云端状态
              if (status.updatetime < updatetime) {
                scriptcatSync.status.scripts[script.uuid] = {
                  enable: script.status === SCRIPT_STATUS_ENABLE,
                  sort: script.sort,
                  updatetime: updatetime,
                };
                return;
              }
              // 否则采用云端状态
              scriptcatSync.status.scripts[script.uuid] = status;
              // 脚本顺序
              if (status.sort !== script.sort) {
                await this.scriptDAO.update(script.uuid, {
                  sort: status.sort,
                });
              }
              // 脚本状态
              if (status.enable !== (script.status === SCRIPT_STATUS_ENABLE)) {
                // 开启脚本
                await this.script.enableScript({
                  uuid: script.uuid,
                  enable: status.enable,
                });
              }
            }
          })
        );
        // 保留被跳过的 orphan uuid 的云端 status，避免覆盖另一台设备半上传的状态
        skippedOrphanUuids.forEach((uuid) => {
          const status = cloudStatus[uuid];
          if (status) {
            scriptcatSync.status.scripts[uuid] = status;
          }
        });
        if (file) {
          const latestCloudStatus = await this.readScriptcatSyncStatus(fs, file);
          scriptcatSync.status.scripts = this.mergeScriptcatSyncStatus(
            cloudStatus,
            latestCloudStatus,
            scriptcatSync.status.scripts
          );
        }
        // 保存脚本猫同步状态
        const modifiedDate = Date.now();
        const syncFile = await fs.create("scriptcat-sync.json", { modifiedDate });
        await syncFile.write(JSON.stringify(scriptcatSync, null, 2));
        this.logger.info("sync scriptcat-sync.json file success");
      } catch (e) {
        this.logger.warn("sync scriptcat-sync.json file failed", Logger.E(e));
      }
    } else if (syncConfig.syncStatus && !canWriteScriptcatSync) {
      this.logger.warn("skip scriptcat-sync.json write because cloud status could not be read");
    }
    // 重新获取文件列表,保存文件摘要
    this.logger.info("update file digest");
    await this.updateFileDigest(fs, pushedFileDigestMap, preserveDigestFiles);
    this.logger.info("sync complete");
    return;
  }

  private classifySyncError(error: unknown): SyncErrorKind {
    if (error instanceof PushScriptPartialError) {
      return this.classifySyncError(error.originalError);
    }
    if (error instanceof FileSystemError) {
      if (error.conflict) {
        return "conflict";
      }
      if (error.rateLimit || error.retryable) {
        return "transient";
      }
      if (error.notFound) {
        return "stale_snapshot";
      }
      if (error.auth) {
        return "fatal";
      }
      return "fatal";
    }
    if (isWarpTokenError(error)) {
      return "fatal";
    }
    if (error instanceof Error && /\bunsupported\b/i.test(error.message)) {
      return "unsupported";
    }
    return "fatal";
  }

  private async readScriptcatSyncStatus(fs: FileSystem, file: FileInfo): Promise<ScriptcatSync["status"]["scripts"]> {
    const cloudScriptCatSync = JSON.parse(await fs.open(file).then((f) => f.read("string"))) as Partial<ScriptcatSync>;
    return cloudScriptCatSync.status?.scripts || {};
  }

  private mergeScriptcatSyncStatus(
    initialStatus: ScriptcatSync["status"]["scripts"],
    latestStatus: ScriptcatSync["status"]["scripts"],
    candidateStatus: ScriptcatSync["status"]["scripts"]
  ): ScriptcatSync["status"]["scripts"] {
    const merged: ScriptcatSync["status"]["scripts"] = { ...latestStatus };
    for (const uuid of Object.keys(candidateStatus)) {
      const candidate = candidateStatus[uuid];
      if (!candidate) {
        continue;
      }
      const initial = initialStatus[uuid];
      const latest = latestStatus[uuid];
      const candidateOnlyPreservedInitial =
        initial &&
        candidate.enable === initial.enable &&
        candidate.sort === initial.sort &&
        candidate.updatetime === initial.updatetime;
      if (candidateOnlyPreservedInitial) {
        // Defer to remote: if another device deleted this uuid, respect the deletion
        if (latest !== undefined) {
          merged[uuid] = latest;
        }
        continue;
      }
      if (!latest || candidate.updatetime >= latest.updatetime) {
        merged[uuid] = candidate;
      }
    }
    return merged;
  }

  async updateFileDigest(
    fs: FileSystem,
    knownFileDigestMap: FileDigestMap = {},
    preserveFileNames = new Set<string>()
  ) {
    // 先落库本次成功推送内容的 md5（独立于易失的 fs.list），供 CAS 冲突时识别云端是否为本机所写
    await this.recordPushedContentMd5(knownFileDigestMap);
    const oldFileDigestMap = ((await this.storage.get("file_digest")) as FileDigestMap) || {};
    const newList = await fs.list();
    const newFileDigestMap: FileDigestMap = {};
    for (const file of newList) {
      if (preserveFileNames.has(file.name)) {
        if (oldFileDigestMap[file.name] !== undefined) {
          newFileDigestMap[file.name] = oldFileDigestMap[file.name];
        }
        continue;
      }
      newFileDigestMap[file.name] = file.digest;
    }
    // 各后端 digest 格式不一（WebDAV/OneDrive/S3 是 etag、Dropbox 是 content_hash、Zip 为空，
    // 仅 GoogleDrive/Baidu 是 md5），只在云端列表暂时漏掉刚上传的文件时用本地 md5 兜底，
    // 不能覆盖 fs.list 已返回的原生 digest，否则下次同步比对会因格式不一致而误判
    for (const name in knownFileDigestMap) {
      if (!(name in newFileDigestMap) && !preserveFileNames.has(name)) {
        newFileDigestMap[name] = knownFileDigestMap[name];
      }
    }
    preserveFileNames.forEach((name) => {
      if (!(name in newFileDigestMap) && oldFileDigestMap[name] !== undefined) {
        newFileDigestMap[name] = oldFileDigestMap[name];
      }
    });
    await this.storage.set("file_digest", newFileDigestMap);
    // syncOnce 已全量对账整份云端列表，可安全清理 file_digest 之外的 push_content_md5，避免只增不删
    await this.prunePushedContentMd5((name) => !(name in newFileDigestMap));
    return;
  }

  // 队列路径（scriptInstall/scriptsDelete）只推送/删除了指定 uuid 的文件，只能更新这些文件的 digest 记录。
  // 不能像 syncOnce 那样全量盖章：syncOnce 已逐文件对账整份云端列表，而队列路径没有——全量盖章会把
  // 他端已更新但本机尚未 pull 的文件也标成已同步，导致下轮 syncOnce 早退漏 pull。
  async updateFileDigestForUuids(
    fs: FileSystem,
    uuids: string[],
    knownFileDigestMap: FileDigestMap = {},
    preserveFileNames = new Set<string>()
  ) {
    // 先落库本次成功推送内容的 md5（独立于易失的 fs.list），供 CAS 冲突时识别云端是否为本机所写
    await this.recordPushedContentMd5(knownFileDigestMap);
    const fileDigestMap = ((await this.storage.get("file_digest")) as FileDigestMap) || {};
    const targetFiles = new Set(uuids.flatMap((uuid) => [`${uuid}.user.js`, `${uuid}.meta.json`]));
    const newList = await fs.list();
    const listedDigest = new Map(newList.map((file) => [file.name, file.digest]));
    // 本次确认已从云端删除的目标文件，其 push_content_md5 一并清理（仅限本次目标，队列路径未全量对账不能全局清理）
    const deletedTargetFiles = new Set<string>();
    for (const name of targetFiles) {
      if (preserveFileNames.has(name)) {
        // 失败文件保留旧 digest，下轮重试
        continue;
      }
      if (listedDigest.has(name)) {
        // 云端仍在：记录原生 digest（各后端 etag/content_hash/md5 格式不一，须用 list 的原生值而非本地 md5）
        fileDigestMap[name] = listedDigest.get(name)!;
      } else if (name in knownFileDigestMap) {
        // 云端列表暂时漏掉刚上传的文件（最终一致性延迟）：用本地 md5 兜底
        fileDigestMap[name] = knownFileDigestMap[name];
      } else {
        // 云端已不存在（删除）：移除记录
        delete fileDigestMap[name];
        deletedTargetFiles.add(name);
      }
    }
    await this.storage.set("file_digest", fileDigestMap);
    await this.prunePushedContentMd5((name) => deletedTargetFiles.has(name));
    return;
  }

  // 删除云端脚本数据
  async deleteCloudScript(fs: FileSystem, uuid: string, syncDelete: boolean) {
    const filename = `${uuid}.user.js`;
    const metaFilename = `${uuid}.meta.json`;
    const fileDigestMap = ((await this.storage.get("file_digest")) as FileDigestMap) || {};
    const logger = this.logger.with({
      uuid: uuid,
      file: filename,
    });
    try {
      await this.deleteCloudFile(fs, filename, fileDigestMap);
      if (syncDelete) {
        // 留下一个.meta.json删除标记
        const modifiedDate = Date.now();
        const meta = await fs.create(metaFilename, { modifiedDate });
        await meta.write(
          JSON.stringify(<SyncMeta>{
            uuid: uuid,
            // origin: script.origin,
            // downloadUrl: script.downloadUrl,
            // checkUpdateUrl: script.checkUpdateUrl,
            isDeleted: true,
          })
        );
      } else {
        // 直接删除所有相关文件
        await this.deleteCloudFile(fs, metaFilename, fileDigestMap);
      }
      logger.info("delete success");
    } catch (e) {
      logger.error("delete file error", Logger.E(e));
      throw e;
    }
    return;
  }

  private buildDeleteOptions(fs: FileSystem, filename: string, fileDigestMap: FileDigestMap) {
    if (!getFileSystemCapabilities(fs).supportsConditionalDelete) {
      return undefined;
    }
    const expectedDigest = fileDigestMap[filename];
    if (!expectedDigest) {
      return undefined;
    }
    return { expectedDigest };
  }

  private async deleteCloudFile(fs: FileSystem, filename: string, fileDigestMap: FileDigestMap) {
    const opts = this.buildDeleteOptions(fs, filename, fileDigestMap);
    if (opts) {
      await fs.delete(filename, opts);
      return;
    }
    await fs.delete(filename);
  }

  // 上传脚本
  async pushScript(fs: FileSystem, script: PushScriptParam, opts: PushScriptOptions = {}): Promise<FileDigestMap> {
    const filename = `${script.uuid}.user.js`;
    const metaFilename = `${script.uuid}.meta.json`;
    const logger = this.logger.with({
      uuid: script.uuid,
      name: script.name,
      file: filename,
    });
    // 记录本次已成功写入云端的文件，供部分失败时区分「成功文件」与「失败文件」
    const writtenFiles: string[] = [];
    try {
      const modifiedDate = getScriptModifiedDate(script);
      const w = await fs.create(
        filename,
        this.buildPushCreateOptions(fs, filename, modifiedDate, opts.scriptFile, opts)
      );
      // 获取脚本代码
      const code = await this.scriptCodeDAO.get(script.uuid);
      const scriptCode = code!.code;
      await w.write(scriptCode);
      writtenFiles.push(filename);
      const meta = await fs.create(
        metaFilename,
        this.buildPushCreateOptions(fs, metaFilename, modifiedDate, opts.metaFile, opts)
      );
      const metaJson = JSON.stringify(<SyncMeta>{
        uuid: script.uuid,
        origin: script.origin,
        downloadUrl: script.downloadUrl,
        checkUpdateUrl: script.checkUpdateUrl,
      });
      await meta.write(metaJson);
      writtenFiles.push(metaFilename);
      logger.info("push script success");
      return {
        [filename]: md5OfText(scriptCode),
        [metaFilename]: md5OfText(metaJson),
      };
    } catch (e) {
      // 自我 412 收敛：本地记录的云端 digest 记账失败（上次 fs.list 抛错 / SW 被杀）后再次编辑，
      // 会拿过期 digest 对「自己上次写入的云端内容」做 If-Match，陷入永久 412。识别到冲突文件的
      // 云端内容正是本机上次成功写入时，以云端当前 digest 为新基准重推一次收敛；真·他端并发编辑
      // （内容不符）则维持停在冲突，绝不覆盖他端。
      if (!opts.selfHealRetried && !writtenFiles.includes(filename) && this.classifySyncError(e) === "conflict") {
        const rebased = await this.rebaseSelfWrittenConflict(fs, script, opts.fileDigestMap);
        if (rebased) {
          logger.warn("self-heal 412 conflict by rebasing on own last push");
          return await this.pushScript(fs, script, {
            fileDigestMap: rebased,
            hasListSnapshot: false,
            selfHealRetried: true,
          });
        }
      }
      logger.error("push script error", Logger.E(e));
      throw new PushScriptPartialError(e, writtenFiles);
    }
  }

  // CAS 冲突时判断冲突文件的云端内容是否为本机上次成功写入：
  // 是 → 返回以云端当前原生 digest 为新基准的 fileDigestMap（供重推）；否 → 返回 null（真·他端并发编辑）。
  private async rebaseSelfWrittenConflict(
    fs: FileSystem,
    script: PushScriptParam,
    fileDigestMap: FileDigestMap = {}
  ): Promise<FileDigestMap | null> {
    const filename = `${script.uuid}.user.js`;
    const metaFilename = `${script.uuid}.meta.json`;
    try {
      const pushedContentMd5 = ((await this.storage.get("push_content_md5")) as FileDigestMap) || {};
      const recordedMd5 = pushedContentMd5[filename];
      if (!recordedMd5) {
        return null;
      }
      const list = await fs.list();
      const cloudFiles = new Map(list.map((file) => [file.name, file]));
      const cloudScript = cloudFiles.get(filename);
      if (!cloudScript) {
        return null;
      }
      const cloudCode = (await fs.open(cloudScript).then((r) => r.read("string"))) as string;
      if (md5OfText(cloudCode) !== recordedMd5) {
        // 云端内容不是本机上次写入 → 真·他端并发编辑，维持停在冲突
        return null;
      }
      const rebased: FileDigestMap = { ...fileDigestMap };
      for (const name of [filename, metaFilename]) {
        const info = cloudFiles.get(name);
        if (info) {
          rebased[name] = info.digest;
        }
      }
      return rebased;
    } catch (e) {
      this.logger.warn("rebase self-written conflict failed", Logger.E(e), { uuid: script.uuid });
      return null;
    }
  }

  // 落库本次成功推送内容的 md5（键为文件名），供 CAS 冲突时识别云端是否为本机所写。
  // 在 updateFileDigest* 内部、fs.list 之前调用，确保即便随后 list 抛错也已持久化。
  private async recordPushedContentMd5(pushedMd5Map: FileDigestMap) {
    const names = Object.keys(pushedMd5Map);
    if (!names.length) {
      return;
    }
    const stored = ((await this.storage.get("push_content_md5")) as FileDigestMap) || {};
    for (const name of names) {
      stored[name] = pushedMd5Map[name];
    }
    await this.storage.set("push_content_md5", stored);
  }

  // 随 file_digest 生命周期收敛 push_content_md5，避免只增不删。shouldRemove 决定某文件名是否移除。
  private async prunePushedContentMd5(shouldRemove: (name: string) => boolean) {
    const stored = ((await this.storage.get("push_content_md5")) as FileDigestMap) || {};
    let changed = false;
    for (const name of Object.keys(stored)) {
      if (shouldRemove(name)) {
        delete stored[name];
        changed = true;
      }
    }
    if (changed) {
      await this.storage.set("push_content_md5", stored);
    }
  }

  private buildPushCreateOptions(
    fs: FileSystem,
    filename: string,
    modifiedDate: number,
    existingFile: FileInfo | undefined,
    opts: PushScriptOptions
  ): FileCreateOptions {
    const capabilities = getFileSystemCapabilities(fs);
    const createOptions: FileCreateOptions = { modifiedDate };
    // CAS 的 If-Match 基准取本地记录的云端 digest（脚本上次同步/安装成功时的版本），
    // 这样其他设备改动过云端文件时能正确检测冲突而不误覆盖。
    // 但本轮 list 快照已确认云端不存在的文件（existingFile 为 undefined 且有快照）例外：
    // 本地残留的 digest 必然过期，对不存在的文件做 If-Match 必然 412，
    // 且失败保留旧 digest 后永不自愈，只能走 create-only。
    // 无快照的场景（scriptInstall 队列）才允许用本地记录 digest 做 CAS——
    // 已同步过的脚本编辑后再次上传必须 CAS 覆盖，否则 create-only 撞上已存在文件必然 412。
    const expectedDigest =
      existingFile === undefined && opts.hasListSnapshot ? undefined : opts.fileDigestMap?.[filename];
    if (existingFile === undefined && expectedDigest === undefined) {
      if (capabilities.supportsCreateOnly) {
        createOptions.createOnly = true;
      }
      return createOptions;
    }
    if (expectedDigest && capabilities.supportsAtomicCompareAndSwap) {
      createOptions.expectedDigest = expectedDigest;
    }
    return createOptions;
  }

  async pullScript(fs: FileSystem, file: SyncFiles, status: ScriptcatSyncStatus | undefined, existingScript?: Script) {
    const logger = this.logger.with({
      uuid: existingScript?.uuid || "",
      name: existingScript?.name || "",
      file: file.script.name,
    });
    try {
      // 读取代码文件
      const r = await fs.open(file.script);
      const code = (await r.read("string")) as string;
      // 读取meta文件
      const meta = await fs.open(file.meta);
      const metaJson = (await meta.read("string")) as string;
      const metaObj = JSON.parse(metaJson) as SyncMeta;
      const { script } = await prepareScriptByCode(
        code,
        existingScript?.downloadUrl || metaObj.downloadUrl || "",
        existingScript?.uuid || metaObj.uuid
      );
      script.origin = script.origin || metaObj.origin;
      if (status) {
        if (existingScript) {
          if (!existingScript.updatetime || status.updatetime > existingScript.updatetime) {
            // 如果云端状态的更新时间大于本地状态的更新时间,则采用云端状态
            script.sort = status.sort;
            script.status = status.enable ? SCRIPT_STATUS_ENABLE : SCRIPT_STATUS_DISABLE;
          }
        } else {
          // 新安装的脚本采用云端状态
          script.sort = status.sort;
          script.status = status.enable ? SCRIPT_STATUS_ENABLE : SCRIPT_STATUS_DISABLE;
        }
      }
      await this.script.installScript({
        script,
        code,
        upsertBy: "sync",
        // 本地 updatetime 采用云端文件时间（与 push 把 modifiedDate 设为本地 updatetime 对称）。
        // 若放任 prepareScriptByCode 的 Date.now()，下一轮会把刚拉下来的内容误判为
        // "本地编辑过"而补偿 push；etag 型 provider 重写会换 etag，两台设备将永久 pull/push 振荡
        updatetime: file.script.updatetime,
      });
      logger.info("pull script success");
    } catch (e) {
      logger.error("pull script error", Logger.E(e));
      throw e;
    }
  }

  cloudSyncConfigChange(value: CloudSyncConfig) {
    if (value.enable) {
      // 开启云同步同步
      this.buildFileSystem(value)
        .then(async (fs) => {
          await this.syncOnce(value, fs);
          // 开启定时器, 一小时一次
          chrome.alarms.get("cloudSync", (alarm) => {
            const lastError = chrome.runtime.lastError;
            if (lastError) {
              console.error("chrome.runtime.lastError in chrome.alarms.get:", lastError);
              // 非预期的异常API错误，停止处理
            }
            if (!alarm) {
              chrome.alarms.create(
                "cloudSync",
                {
                  periodInMinutes: 60,
                },
                () => {
                  const lastError = chrome.runtime.lastError;
                  if (lastError) {
                    console.error("chrome.runtime.lastError in chrome.alarms.create:", lastError);
                    // Starting in Chrome 117, the number of active alarms is limited to 500. Once this limit is reached, chrome.alarms.create() will fail.
                    console.error("Chrome alarm is unable to create. Please check whether limit is reached.");
                  }
                }
              );
            }
          });
        })
        .catch((e) => {
          this.logger.error("cloud sync config change error", Logger.E(e));
        });
    } else {
      // 停止计时器
      chrome.alarms.clear("cloudSync");
    }
  }

  async scriptInstall(params: TInstallScript) {
    if (params.upsertBy === "sync") {
      return;
    }
    // 判断是否开启了同步
    const config = await this.systemConfig.getCloudSync();
    if (config.enable) {
      stackAsyncTask(SYNC_SERVICE_TASK_KEY, async () => {
        const fs = await this.buildFileSystem(config);
        // 已同步过的脚本本地记录了其云端 digest，据此做 CAS 覆盖；没有记录才是首次上传走 create-only。
        // 缺了它，编辑已存在的云端脚本会因 create-only 而 412 冲突，本地改动永远上不了云。
        const fileDigestMap = ((await this.storage.get("file_digest")) as FileDigestMap) || {};
        const script = params.script;
        try {
          const pushedFileDigestMap = await this.pushScript(fs, script, { fileDigestMap });
          await this.updateFileDigestForUuids(fs, [script.uuid], pushedFileDigestMap);
        } catch (e) {
          // 部分成功（如 .user.js 成功、.meta.json 失败）时，已写成功文件的云端 digest 已更新，
          // 必须记录其最新 digest、只保留失败文件的旧值，否则下一轮同步会拿过期 digest 做 CAS 永久 412。
          // 全部失败（无文件写入成功）则不动 file_digest，保持"失败不污染"。
          const writtenFiles = e instanceof PushScriptPartialError ? e.writtenFiles : [];
          if (writtenFiles.length > 0) {
            const preserve = new Set(
              [`${script.uuid}.user.js`, `${script.uuid}.meta.json`].filter((name) => !writtenFiles.includes(name))
            );
            await this.updateFileDigestForUuids(fs, [script.uuid], {}, preserve);
          }
          throw e;
        }
      }).catch((e) => {
        this.logger.error("push script on install error", Logger.E(e), {
          errorKind: this.classifySyncError(e),
        });
      });
    }
  }

  async scriptsDelete(data: TDeleteScript[]) {
    // 过滤掉来源为 sync 的删除事件，避免 syncOnce 内部触发的 mq 回灌
    // 又排一次 buildFileSystem + updateFileDigest 的空跑任务
    const items = data.filter((d) => d.deleteBy !== "sync");
    if (!items.length) {
      return;
    }
    // 判断是否开启了同步
    const config = await this.systemConfig.getCloudSync();
    if (config.enable) {
      stackAsyncTask(SYNC_SERVICE_TASK_KEY, async () => {
        const fs = await this.buildFileSystem(config);
        const preserveDigestFiles = new Set<string>();
        for (const { uuid } of items) {
          try {
            await this.deleteCloudScript(fs, uuid, config.syncDelete);
          } catch (e) {
            preserveDigestFiles.add(`${uuid}.user.js`);
            preserveDigestFiles.add(`${uuid}.meta.json`);
            this.logger.warn("delete cloud script item failed", Logger.E(e), {
              uuid,
              errorKind: this.classifySyncError(e),
            });
          }
        }
        await this.updateFileDigestForUuids(
          fs,
          items.map((item) => item.uuid),
          {},
          preserveDigestFiles
        );
      }).catch((e) => {
        this.logger.error("delete cloud script error", Logger.E(e));
      });
    }
  }

  init() {
    this.group.on("export", this.requestExport.bind(this));
    this.group.on("backupToCloud", this.backupToCloud.bind(this));
    this.group.on("importResources", this.importResources.bind(this));
    // 监听脚本变化, 进行同步
    this.mq.subscribe<TInstallScript>("installScript", this.scriptInstall.bind(this));
    this.mq.subscribe<TDeleteScript[]>("deleteScripts", this.scriptsDelete.bind(this));
  }
}
