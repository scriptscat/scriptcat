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
import ZipFileSystem from "@Packages/filesystem/zip/zip";
import FileSystemFactory, { type FileSystemType } from "@Packages/filesystem/factory";
import { isConflictError, isWarpTokenError } from "@Packages/filesystem/error";
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

type FileDigestMap = {
  [key: string]: string;
};

const SYNC_SERVICE_TASK_KEY = "cloud_sync_queue";
const FILE_DIGEST_STORAGE_KEY = "file_digest";
const TOMBSTONE_DIGEST_STORAGE_KEY = "tombstone_digest";
const SCRIPTCAT_SYNC_FILENAME = "scriptcat-sync.json";
const SCRIPT_FILE_SUFFIX = ".user.js";
const META_FILE_SUFFIX = ".meta.json";

function getScriptModifiedDate(script: PushScriptParam): number {
  return script.updatetime || script.createtime || Date.now();
}

function getWriteOptions(modifiedDate: number, remoteFile?: FileInfo): FileCreateOptions {
  const opts: FileCreateOptions = { modifiedDate };
  if (!remoteFile) {
    // 新文件必须用 createOnly，避免 list 短暂漏文件时把另一台设备刚创建的同名文件覆盖掉。
    opts.createOnly = true;
    return opts;
  }
  // 优先使用 provider 暴露的原生版本 token（etag/rev/version），没有版本时才退到 digest。
  // 部分 provider 的 digest 不是 MD5，调用方不能把 expectedDigest 当成跨 provider 的强一致 CAS。
  if (remoteFile.version) {
    opts.expectedVersion = remoteFile.version;
  } else if (remoteFile.digest) {
    opts.expectedDigest = remoteFile.digest;
  }
  return opts;
}

function getDeleteOptions(remoteFile?: FileInfo) {
  if (!remoteFile) {
    return undefined;
  }
  // 删除也尽量使用远端快照里的版本 token；这能让 S3/WebDAV/OneDrive 走服务端 If-Match。
  // Baidu/Dropbox/Google Drive 只能做删除前校验，仍然不是原子删除，详见各 provider 注释。
  if (remoteFile.version) {
    return { expectedVersion: remoteFile.version };
  }
  if (remoteFile.digest) {
    return { expectedDigest: remoteFile.digest };
  }
  return undefined;
}

async function readSyncMeta(fs: FileSystem, file: FileInfo): Promise<SyncMeta> {
  const meta = await fs.open(file);
  return JSON.parse((await meta.read("string")) as string) as SyncMeta;
}

function groupFilesByUuid(list: FileInfo[]): Map<string, Partial<SyncFiles>> {
  const uuidMap = new Map<string, Partial<SyncFiles>>();
  const getOrCreate = (uuid: string) => {
    let files = uuidMap.get(uuid);
    if (!files) {
      files = {};
      uuidMap.set(uuid, files);
    }
    return files;
  };

  for (const file of list) {
    if (file.name.endsWith(SCRIPT_FILE_SUFFIX)) {
      const uuid = file.name.slice(0, -SCRIPT_FILE_SUFFIX.length);
      getOrCreate(uuid).script = file;
    } else if (file.name.endsWith(META_FILE_SUFFIX)) {
      const uuid = file.name.slice(0, -META_FILE_SUFFIX.length);
      getOrCreate(uuid).meta = file;
    }
  }
  return uuidMap;
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
      const results = await Promise.allSettled(
        uuids.map(async (uuid) => {
          const script = await this.scriptDAO.get(uuid);
          if (!script) {
            throw new Error(`Script ${uuid} not found`);
          }
          return this.generateScriptBackupData(script);
        })
      );
      const failed = results.filter((ret): ret is PromiseRejectedResult => ret.status === "rejected");
      failed.forEach((ret) => {
        this.logger.warn("failed to export selected script", Logger.E(ret.reason));
      });
      if (failed.length) {
        // 用户明确选择导出 uuid 时，缺失/失败不能静默跳过；
        // 否则会生成不完整备份而用户无感。这里先收集并记录所有失败，再让导出整体失败。
        throw new Error(`Failed to export ${failed.length} selected script(s)`);
      }
      return results
        .filter((ret): ret is PromiseFulfilledResult<ScriptBackupData> => ret.status === "fulfilled")
        .map((ret) => ret.value);
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
    const requires = await this.resource.getResourceByType(script, "require", false);
    const requiresCss = await this.resource.getResourceByType(script, "require-css", false);
    const resources = await this.resource.getResourceByType(script, "resource", false);
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
  async requestExport(uuids?: string[]) {
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
    chrome.downloads.download({
      url,
      saveAs: true,
      filename: `scriptcat-backup-${dayFormat(new Date(), "YYYY-MM-DDTHH-mm-ss")}.zip`,
    });
    return;
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
          `${t("sync_system_connect_failed")}, ${t("sync_system_closed")}`,
          `${t("sync_system_closed_description")}\n${errorMsg(e)}`
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

  public notifySyncFailed(hasConflict: boolean, rejectedCount: number) {
    this.logger.warn("skip status and digest update because cloud sync task failed", {
      conflict: hasConflict,
      failed: rejectedCount,
    });
    const title = i18n.t("notification.script_sync_failed");
    const message = hasConflict
      ? i18n.t("notification.script_sync_conflict_desc")
      : i18n.t("notification.script_sync_failed_desc");
    InfoNotification(title, message);
  }

  private async syncOnceInternal(syncConfig: CloudSyncConfig, fs: FileSystem) {
    this.logger.info("start sync once");
    // 获取文件列表
    const list = await fs.list();
    // 根据文件名生成一个map
    const uuidMap = groupFilesByUuid(list);
    // 储存文件摘要,用于检测文件是否有变化
    const fileDigestMap = ((await this.storage.get(FILE_DIGEST_STORAGE_KEY)) as FileDigestMap) || {};
    const tombstoneDigestMap = ((await this.storage.get(TOMBSTONE_DIGEST_STORAGE_KEY)) as FileDigestMap) || {};
    let tombstoneDigestDirty = false;
    const rememberTombstoneDigest = (metaFile: FileInfo) => {
      if (!metaFile.digest || tombstoneDigestMap[metaFile.name] === metaFile.digest) {
        return;
      }
      // 记录“已确认是 tombstone 的 meta digest”。以后即使 provider 的 mtime 精度导致
      // meta/script 时间相等，也能继续识别并清理残留 .user.js；正常非 tombstone 不会多读远端 meta。
      tombstoneDigestMap[metaFile.name] = metaFile.digest;
      tombstoneDigestDirty = true;
    };
    const forgetTombstoneDigest = (metaFile: FileInfo) => {
      if (!tombstoneDigestMap[metaFile.name]) {
        return;
      }
      // 如果同名 meta 已确认不是 tombstone，旧的 tombstone 记录必须清掉；
      // 否则后续每轮都会因为缓存命中而额外读取 meta。
      delete tombstoneDigestMap[metaFile.name];
      tombstoneDigestDirty = true;
    };

    // 获取脚本列表
    const scriptList = await this.scriptDAO.all();
    // 遍历脚本列表生成一个map
    const scriptMap = new Map<string, Script>();
    scriptList.forEach((script) => {
      scriptMap.set(script.uuid, script);
    });

    // 判断文件系统是否有脚本猫同步文件
    const syncStatusFile = list.find((file) => file.name === SCRIPTCAT_SYNC_FILENAME);
    let scriptcatSync = {
      version: ExtVersion,
      status: {
        scripts: {},
      },
    } as ScriptcatSync;
    let cloudStatus: ScriptcatSync["status"]["scripts"] = {};
    if (syncStatusFile) {
      // 如果有,则读取文件内容
      const cloudScriptCatSync = JSON.parse(
        await fs.open(syncStatusFile).then((f) => f.read("string"))
      ) as ScriptcatSync;
      cloudStatus = cloudScriptCatSync.status?.scripts || {};
      // 保留云端 manifest 的未知字段，避免未来扩展字段被本机同步覆盖掉。
      scriptcatSync = {
        ...cloudScriptCatSync,
        version: ExtVersion,
        status: {
          ...cloudScriptCatSync.status,
          scripts: {},
        },
      };
    }

    // 对比脚本列表和文件列表,进行同步
    const result: Promise<FileDigestMap | void>[] = [];
    const updateScript: Map<string, boolean> = new Map();
    // 记录被跳过的孤儿云端脚本（仅 .user.js 无 .meta.json）
    // 避免本机回写 scriptcat-sync.json 时丢失对应 uuid 的云端 status
    const skippedOrphanUuids = new Set<string>();
    // 需要是同步操作，后续上传剩下的脚本
    // 最后使用 Promise.allSettled 进行等待
    for (const [uuid, remoteFiles] of uuidMap) {
      const script = scriptMap.get(uuid);
      if (script) {
        scriptMap.delete(uuid);
        // 脚本存在但是文件不存在,则读取.meta.json内容判断是否需要删除脚本
        if (!remoteFiles.script) {
          result.push(
            (async () => {
              // 读取meta文件
              const meta = await fs.open(remoteFiles.meta!);
              const metaJson = (await meta.read("string")) as string;
              const metaObj = JSON.parse(metaJson) as SyncMeta;
              if (metaObj.isDeleted) {
                rememberTombstoneDigest(remoteFiles.meta!);
                // 删除脚本
                await this.script.deleteScript(script.uuid, "sync");
                InfoNotification(
                  i18n.t("notification.script_sync_delete"),
                  i18n.t("notification.script_sync_delete_desc", {
                    scriptName: i18nName(script),
                  })
                );
              } else {
                forgetTombstoneDigest(remoteFiles.meta!);
                // 否则认为是一个无效的.meta文件，进行删除，并进行同步
                await fs.delete(remoteFiles.meta!.name, getDeleteOptions(remoteFiles.meta));
                return await this.pushScript(fs, script);
              }
            })()
          );
          continue;
        }
        const remoteScript = remoteFiles.script;
        const remoteMeta = remoteFiles.meta;
        let checkedMetaObj: SyncMeta | undefined;
        const scriptDigestUnchanged = fileDigestMap[remoteScript.name] === remoteScript.digest;
        const metaDigestUnchanged = !remoteMeta || fileDigestMap[remoteMeta.name] === remoteMeta.digest;
        const shouldCheckMetaTombstone =
          remoteMeta &&
          (tombstoneDigestMap[remoteMeta.name] === remoteMeta.digest ||
            fileDigestMap[remoteMeta.name] !== remoteMeta.digest ||
            // 兼容没有 tombstone_digest 记录的旧版本/异常中断状态：digest cache 已经记录 tombstone meta，
            // 但 .user.js 仍没删掉。meta 晚于 script 是删除标记的典型形态，才额外读一次 meta。
            // 这是启发式兜底，不作为严格协议；严格收敛依赖上面的 tombstone digest 记录。
            (scriptDigestUnchanged && metaDigestUnchanged && remoteMeta.updatetime > remoteScript.updatetime));
        if (remoteMeta && shouldCheckMetaTombstone) {
          // tombstone 是删除提交信号，优先级高于 .user.js。
          // 如果上次删除在“写 tombstone 后、删 script 前”失败，下一轮会看到 script + tombstone。
          // 这里必须先处理 tombstone，不能因为 script digest 没变而跳过，否则删除可能长期无法收敛。
          checkedMetaObj = await readSyncMeta(fs, remoteMeta);
          if (checkedMetaObj.isDeleted) {
            rememberTombstoneDigest(remoteMeta);
            result.push(
              (async () => {
                await this.script.deleteScript(script.uuid, "sync");
                await fs.delete(remoteScript.name, getDeleteOptions(remoteScript));
                InfoNotification(
                  i18n.t("notification.script_sync_delete"),
                  i18n.t("notification.script_sync_delete_desc", {
                    scriptName: i18nName(script),
                  })
                );
              })()
            );
            continue;
          }
          forgetTombstoneDigest(remoteMeta);
        }
        // 过滤掉无变动的文件
        if (scriptDigestUnchanged) {
          continue;
        }
        const updatetime = script.updatetime || script.createtime;
        // 对比脚本更新时间和文件更新时间
        if (updatetime > remoteFiles.script!.updatetime || !remoteFiles.meta) {
          // 如果脚本更新时间大于文件更新时间
          // 或者不存在.meta文件,则上传文件
          result.push(this.pushScript(fs, script, remoteFiles));
        } else {
          // 如果脚本更新时间小于文件更新时间,则更新脚本
          updateScript.set(uuid, true);
          result.push(this.pullScript(fs, remoteFiles as SyncFiles, cloudStatus[uuid], script, checkedMetaObj));
        }
        continue;
      }
      // 如果脚本不存在，但文件存在，则安装脚本
      if (remoteFiles.script) {
        if (!remoteFiles.meta) {
          // .meta 文件可能尚未上传完成，跳过本次以避免误删云端脚本
          this.logger.warn("skip orphan cloud script without meta", {
            uuid,
            file: remoteFiles.script.name,
          });
          skippedOrphanUuids.add(uuid);
          continue;
        }
        updateScript.set(uuid, true);
        result.push(this.pullScript(fs, remoteFiles as SyncFiles, cloudStatus[uuid]));
      }
    }
    // 上传剩下的脚本
    scriptMap.forEach((script) => {
      result.push(this.pushScript(fs, script));
    });
    // 忽略错误
    const syncResults = await Promise.allSettled(result);
    const pushedFileDigestMap: FileDigestMap = {};
    syncResults.forEach((ret) => {
      if (ret.status === "fulfilled" && ret.value) {
        Object.assign(pushedFileDigestMap, ret.value);
      }
    });
    if (tombstoneDigestDirty) {
      // 本轮可能同时读到多个 meta，统一写一次本地 cache，避免旧记录较多时频繁 storage.set。
      // 即使后续同步任务失败也可以写入：这是“某个 meta digest 已确认是 tombstone”的辅助事实，
      // 不会推进 file_digest 或 scriptcat-sync.json 成功状态，只帮助下一轮继续收敛残留删除。
      await this.storage.set(TOMBSTONE_DIGEST_STORAGE_KEY, tombstoneDigestMap);
    }
    const rejected = syncResults.filter((ret) => ret.status === "rejected");
    if (rejected.length) {
      const hasConflict = rejected.some((ret) => isConflictError(ret.reason));
      rejected.forEach((ret, idx) => {
        this.logger.warn(`sync task #${idx} failed`, Logger.E(ret.reason));
      });
      this.notifySyncFailed(hasConflict, rejected.length);
      return;
    }
    // 同步状态
    if (syncConfig.syncStatus) {
      const latestScriptList = await this.scriptDAO.all();
      const statusResults = await Promise.allSettled(
        latestScriptList.map(async (script) => {
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
      const rejectedStatus = statusResults.filter((ret) => ret.status === "rejected");
      if (rejectedStatus.length) {
        this.notifySyncFailed(false, rejectedStatus.length);
        return;
      }
      // 保留被跳过的 orphan uuid 的云端 status，避免覆盖另一台设备半上传的状态
      skippedOrphanUuids.forEach((uuid) => {
        const status = cloudStatus[uuid];
        if (status) {
          scriptcatSync.status.scripts[uuid] = status;
        }
      });
      // 保存脚本猫同步状态
      const modifiedDate = Date.now();
      try {
        const syncFile = await fs.create(SCRIPTCAT_SYNC_FILENAME, getWriteOptions(modifiedDate, syncStatusFile));
        await syncFile.write(JSON.stringify(scriptcatSync, null, 2));
        this.logger.info("sync scriptcat-sync.json file success");
      } catch (e) {
        this.logger.error("sync scriptcat-sync.json file error", Logger.E(e));
        this.notifySyncFailed(isConflictError(e), 1);
        return;
      }
    }
    // 重新获取文件列表,保存文件摘要
    this.logger.info("update file digest");
    await this.updateFileDigest(fs, pushedFileDigestMap);
    this.logger.info("sync complete");
    return;
  }

  async updateFileDigest(fs: FileSystem, knownFileDigestMap: FileDigestMap = {}) {
    let newList = await fs.list();
    // 有些远端在刚上传后 list 会短暂漏掉新对象；只在“文件名完全没出现”时重试一次。
    // 如果文件名出现但 digest 还是旧值，仍保留 provider 返回值，避免用本地 MD5 污染 etag/rev/hash。
    // 这个取舍可能导致下一轮重复同步或误判变更，但不会把 provider 原生 digest 缓存成错误格式。
    if (Object.keys(knownFileDigestMap).some((name) => !newList.some((file) => file.name === name))) {
      newList = await fs.list();
    }
    const listedFileDigestMap: FileDigestMap = {};
    for (const file of newList) {
      listedFileDigestMap[file.name] = file.digest;
    }
    const tombstoneDigestMap = ((await this.storage.get(TOMBSTONE_DIGEST_STORAGE_KEY)) as FileDigestMap) || {};
    if (Object.keys(tombstoneDigestMap).length) {
      let changed = false;
      const nextTombstoneDigestMap: FileDigestMap = {};
      for (const name in tombstoneDigestMap) {
        if (listedFileDigestMap[name] === tombstoneDigestMap[name]) {
          nextTombstoneDigestMap[name] = tombstoneDigestMap[name];
        } else if (!(name in listedFileDigestMap)) {
          // list 在部分后端可能短暂漏文件。不要因为一次没看到 meta 就丢掉 tombstone cache，
          // 否则残留 .user.js 的收敛会退回到 mtime 启发式。
          nextTombstoneDigestMap[name] = tombstoneDigestMap[name];
        } else {
          changed = true;
        }
      }
      if (changed) {
        // tombstone 标记只用于“已确认删除 meta”的收敛加速。
        // 只有同名 meta 仍在但 digest 已变化时才清理；meta 暂时没出现在 list 时先保留，
        // 避免最终一致性/缓存导致下一轮丢失 tombstone 收敛信号。
        await this.storage.set(TOMBSTONE_DIGEST_STORAGE_KEY, nextTombstoneDigestMap);
      }
    }
    const newFileDigestMap: FileDigestMap = { ...listedFileDigestMap };
    // 各后端 digest 格式不一（WebDAV/OneDrive/S3 是 etag、Dropbox 是 content_hash、Zip 为空，
    // 仅 GoogleDrive/Baidu 是 md5），只在云端列表暂时漏掉刚上传的文件时用本地 md5 兜底，
    // 不能覆盖 fs.list 已返回的原生 digest，否则下次同步比对会因格式不一致而误判
    for (const name in knownFileDigestMap) {
      if (!(name in newFileDigestMap)) {
        newFileDigestMap[name] = knownFileDigestMap[name];
      }
    }
    await this.storage.set(FILE_DIGEST_STORAGE_KEY, newFileDigestMap);
    return;
  }

  // 删除云端脚本数据
  async deleteCloudScript(fs: FileSystem, uuid: string, syncDelete: boolean, remoteFiles?: Partial<SyncFiles>) {
    const filename = `${uuid}.user.js`;
    const logger = this.logger.with({
      uuid: uuid,
      file: filename,
    });
    try {
      // 只有调用方没有远端快照，或快照明确看到 script 时才删除。
      // 如果快照存在但没看到文件，跳过删除，避免最终一致性/list 缓存漏文件时退化成无条件删除。
      if (!remoteFiles || remoteFiles.script) {
        await fs.delete(filename, getDeleteOptions(remoteFiles?.script));
      }
      if (syncDelete) {
        // 删除协议仍以 .meta.json tombstone 作为对其他设备的提交信号。
        // 注意：当前不是事务写入。script 已删但 tombstone 写失败时，上层会报错且不推进 digest，
        // 但远端仍可能短暂处于半提交状态；彻底解决需要 manifest/commit 协议。
        // 不在这里补偿恢复 script：恢复也是一次写入，可能覆盖另一台设备在失败窗口内的新版本。
        const modifiedDate = Date.now();
        const meta = await fs.create(`${uuid}.meta.json`, getWriteOptions(modifiedDate, remoteFiles?.meta));
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
        // 同 script 删除一样，快照存在但没看到 meta 时不做无条件删除。
        if (!remoteFiles || remoteFiles.meta) {
          await fs.delete(`${uuid}.meta.json`, getDeleteOptions(remoteFiles?.meta));
        }
      }
      logger.info("delete success");
    } catch (e) {
      logger.error("delete file error", Logger.E(e));
      throw e;
    }
    return;
  }

  // 上传脚本
  async pushScript(fs: FileSystem, script: PushScriptParam, remoteFiles?: Partial<SyncFiles>): Promise<FileDigestMap> {
    const filename = `${script.uuid}.user.js`;
    const metaFilename = `${script.uuid}.meta.json`;
    const logger = this.logger.with({
      uuid: script.uuid,
      name: script.name,
      file: filename,
    });
    try {
      const modifiedDate = getScriptModifiedDate(script);
      // 获取脚本代码
      const code = await this.scriptCodeDAO.get(script.uuid);
      const scriptCode = code!.code;
      const metaJson = JSON.stringify(<SyncMeta>{
        uuid: script.uuid,
        origin: script.origin,
        downloadUrl: script.downloadUrl,
        checkUpdateUrl: script.checkUpdateUrl,
      });
      const scriptDigest = md5OfText(scriptCode);
      let scriptWritten = false;

      try {
        const w = await fs.create(filename, getWriteOptions(modifiedDate, remoteFiles?.script));
        await w.write(scriptCode);
        scriptWritten = true;
        const meta = await fs.create(metaFilename, getWriteOptions(modifiedDate, remoteFiles?.meta));
        await meta.write(metaJson);
      } catch (e) {
        if (scriptWritten && !remoteFiles?.script) {
          // 只清理“本次新建 script 成功但 meta 写失败”的孤儿文件，且必须带 digest 守卫。
          // 这个 digest 是本地 MD5，部分 provider 的远端 digest/etag 不同，清理可能失败；
          // 清理失败只会留下 orphan，下次同步会跳过 orphan，不应为了清理而改成无条件删除。
          // 这里不影响正常删除操作：cleanup 只发生在 push 失败路径，失败也会保留原始错误继续上抛。
          await fs.delete(filename, { expectedDigest: scriptDigest }).catch((cleanupError) => {
            logger.warn("cleanup newly created script after meta write failure failed", Logger.E(cleanupError));
          });
        }
        throw e;
      }
      logger.info("push script success");
      return {
        [filename]: scriptDigest,
        [metaFilename]: md5OfText(metaJson),
      };
    } catch (e) {
      logger.error("push script error", Logger.E(e));
      throw e;
    }
  }

  async pullScript(
    fs: FileSystem,
    file: SyncFiles,
    status: ScriptcatSyncStatus | undefined,
    existingScript?: Script,
    knownMetaObj?: SyncMeta
  ) {
    const logger = this.logger.with({
      uuid: existingScript?.uuid || "",
      name: existingScript?.name || "",
      file: file.script.name,
    });
    try {
      // 先读 meta。tombstone 是删除提交信号，命中后不需要、也不应该依赖 .user.js 仍可读取。
      const metaObj = knownMetaObj || (await readSyncMeta(fs, file.meta));
      if (metaObj.isDeleted) {
        if (existingScript) {
          await this.script.deleteScript(existingScript.uuid, "sync");
        }
        await fs.delete(file.script.name, getDeleteOptions(file.script));
        logger.info("pull tombstone delete success");
        return;
      }
      // 只有确认不是 tombstone 后才读取脚本内容，避免删除路径被残留/已删除的 .user.js 阻塞。
      const r = await fs.open(file.script);
      const code = (await r.read("string")) as string;
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
        const list = await fs.list();
        const uuid = params.script.uuid;
        const remoteFiles: Partial<SyncFiles> = {
          script: list.find((file) => file.name === `${uuid}.user.js`),
          meta: list.find((file) => file.name === `${uuid}.meta.json`),
        };
        const pushedFileDigestMap = await this.pushScript(fs, params.script, remoteFiles);
        await this.updateFileDigest(fs, pushedFileDigestMap);
      }).catch((e) => {
        this.logger.error("push script on install error", Logger.E(e));
        this.notifySyncFailed(isConflictError(e), 1);
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
        const list = await fs.list();
        for (const { uuid } of items) {
          await this.deleteCloudScript(fs, uuid, config.syncDelete, {
            script: list.find((file) => file.name === `${uuid}.user.js`),
            meta: list.find((file) => file.name === `${uuid}.meta.json`),
          });
        }
        await this.updateFileDigest(fs);
      }).catch((e) => {
        this.logger.error("delete cloud script error", Logger.E(e));
        this.notifySyncFailed(isConflictError(e), 1);
      });
    }
  }

  init() {
    this.group.on("export", this.requestExport.bind(this));
    this.group.on("backupToCloud", this.backupToCloud.bind(this));
    this.group.on("importResources", this.importResources.bind(this));
    // this.group.on("import", this.openImportWindow.bind(this));
    // 监听脚本变化, 进行同步
    this.mq.subscribe<TInstallScript>("installScript", this.scriptInstall.bind(this));
    this.mq.subscribe<TDeleteScript[]>("deleteScripts", this.scriptsDelete.bind(this));
  }
}
