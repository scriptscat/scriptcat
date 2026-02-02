import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import type { Resource } from "@App/app/repo/resource";
import { type Script, SCRIPT_STATUS_DISABLE, SCRIPT_STATUS_ENABLE, type ScriptDAO } from "@App/app/repo/scripts";
import BackupExport from "@App/pkg/backup/export";
import type { BackupData, ResourceBackup, ScriptBackupData, ScriptOptions, ValueStorage } from "@App/pkg/backup/struct";
import type { FileInfo } from "@Packages/filesystem/filesystem";
import type FileSystem from "@Packages/filesystem/filesystem";
import ZipFileSystem from "@Packages/filesystem/zip/zip";
import FileSystemFactory, { type FileSystemType } from "@Packages/filesystem/factory";
import { isWarpTokenError } from "@Packages/filesystem/error";
import type { Group } from "@Packages/message/server";
import type { MessageSend } from "@Packages/message/types";
import { type IMessageQueue } from "@Packages/message/message_queue";
import JSZip from "jszip";
import { type ValueService } from "./value";
import { type ResourceService } from "./resource";
import { createObjectURL } from "../offscreen/client";
import { type CloudSyncConfig, type SystemConfig } from "@App/pkg/config/config";
import type { TDeleteScript, TInstallScript, TInstallScriptParams } from "../queue";
import { errorMsg, InfoNotification } from "@App/pkg/utils/utils";
import { t } from "i18next";
import ChromeStorage from "@App/pkg/config/chrome_storage";
import { type ScriptService } from "./script";
import { prepareScriptByCode } from "@App/pkg/utils/script";
import { ExtVersion } from "@App/app/const";
import { dayFormat } from "@App/pkg/utils/day_format";
import i18n, { i18nName } from "@App/locales/locales";

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

type PushScriptParam = TInstallScriptParams;

export class SynchronizeService {
  logger: Logger;

  scriptCodeDAO = this.scriptDAO.scriptCodeDAO;

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
          modified: script.updatetime,
          file_url: script.downloadUrl,
          subscribe_url: script.subscribeUrl,
        },
      },
      // storage,
      requires: [],
      requiresCss: [],
      resources: [],
    } as unknown as ScriptBackupData;
    const storage: ValueStorage = {
      data: {},
      ts: Date.now(),
    };
    const values = await this.value.getScriptValue(script);
    for (const key of Object.keys(values)) {
      storage.data[key] = values[key];
    }

    const requires = await this.resource.getResourceByType(script, "require", false);
    const requiresCss = await this.resource.getResourceByType(script, "require-css", false);
    const resources = await this.resource.getResourceByType(script, "resource", false);

    ret.requires = this.resourceToBackdata(requires);
    ret.requiresCss = this.resourceToBackdata(requiresCss);
    ret.resources = this.resourceToBackdata(resources);

    ret.storage = storage;
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
    const zip = new JSZip();
    const fs = new ZipFileSystem(zip);
    await this.backup(fs, uuids);
    // 生成文件,并下载
    const files = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: {
        level: 9,
      },
      comment: "Created by Scriptcat",
    });
    const url = await createObjectURL(this.msgSender, files);
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
    const zip = new JSZip();
    const fs = new ZipFileSystem(zip);
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
        await zip.generateAsync({
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
    this.logger.info("start sync once");
    // 获取文件列表
    const list = await fs.list();
    // 根据文件名生成一个map
    const uuidMap = new Map<string, Partial<SyncFiles>>();
    // 储存文件摘要,用于检测文件是否有变化
    const fileDigestMap =
      ((await this.storage.get("file_digest")) as {
        [key: string]: string;
      }) || {};

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
    if (file) {
      // 如果有,则读取文件内容
      const cloudScriptCatSync = JSON.parse(await fs.open(file).then((f) => f.read("string"))) as ScriptcatSync;
      cloudStatus = cloudScriptCatSync.status.scripts;
    }

    // 对比脚本列表和文件列表,进行同步
    const result: Promise<void>[] = [];
    const updateScript: Map<string, boolean> = new Map();
    // 需要是同步操作，后续上传剩下的脚本
    // 最后使用 Promise.allSettled 进行等待
    uuidMap.forEach((file, uuid) => {
      const script = scriptMap.get(uuid);
      if (script) {
        scriptMap.delete(uuid);
        // 脚本存在但是文件不存在,则读取.meta.json内容判断是否需要删除脚本
        if (!file.script) {
          result.push(
            (async () => {
              // 读取meta文件
              const meta = await fs.open(file.meta!);
              const metaJson = (await meta.read("string")) as string;
              const metaObj = JSON.parse(metaJson) as SyncMeta;
              if (metaObj.isDeleted) {
                // 删除脚本
                this.script.deleteScript(script.uuid, "sync");
                InfoNotification(
                  i18n.t("notification.script_sync_delete"),
                  i18n.t("notification.script_sync_delete_desc", { scriptName: i18nName(script) })
                );
              } else {
                // 否则认为是一个无效的.meta文件，进行删除，并进行同步
                await fs.delete(file.meta!.name);
                result.push(this.pushScript(fs, script));
              }
            })()
          );
          return;
        }
        // 过滤掉无变动的文件
        if (fileDigestMap[file.script!.name] === file.script!.digest) {
          return;
        }
        const updatetime = script.updatetime || script.createtime;
        // 对比脚本更新时间和文件更新时间
        if (updatetime > file.script!.updatetime || !file.meta) {
          // 如果脚本更新时间大于文件更新时间
          // 或者不存在.meta文件,则上传文件
          result.push(this.pushScript(fs, script));
        } else {
          // 如果脚本更新时间小于文件更新时间,则更新脚本
          updateScript.set(uuid, true);
          result.push(this.pullScript(fs, file as SyncFiles, cloudStatus[uuid], script));
        }
        return;
      }
      // 如果脚本不存在，但文件存在，则安装脚本
      if (file.script) {
        if (!file.meta) {
          // 如果.meta文件不存在，则删除脚本文件，并跳过
          result.push(fs.delete(file.script.name));
          return;
        }
        updateScript.set(uuid, true);
        result.push(this.pullScript(fs, file as SyncFiles, cloudStatus[uuid]));
      }
    });
    // 上传剩下的脚本
    scriptMap.forEach((script) => {
      result.push(this.pushScript(fs, script));
    });
    // 忽略错误
    await Promise.allSettled(result);
    // 同步状态
    if (syncConfig.syncStatus) {
      const scriptlist = await this.scriptDAO.all();
      await Promise.allSettled(
        scriptlist.map(async (script) => {
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
      // 保存脚本猫同步状态
      const syncFile = await fs.create("scriptcat-sync.json");
      await syncFile.write(JSON.stringify(scriptcatSync, null, 2));
      this.logger.info("sync scriptcat-sync.json file success");
    }
    // 重新获取文件列表,保存文件摘要
    this.logger.info("update file digest");
    await this.updateFileDigest(fs);
    this.logger.info("sync complete");
    return;
  }

  async updateFileDigest(fs: FileSystem) {
    const newList = await fs.list();
    const newFileDigestMap: { [key: string]: string } = {};
    for (const file of newList) {
      newFileDigestMap[file.name] = file.digest;
    }
    await this.storage.set("file_digest", newFileDigestMap);
    return;
  }

  // 删除云端脚本数据
  async deleteCloudScript(fs: FileSystem, uuid: string, syncDelete: boolean) {
    const filename = `${uuid}.user.js`;
    const logger = this.logger.with({
      uuid: uuid,
      file: filename,
    });
    try {
      await fs.delete(filename);
      if (syncDelete) {
        // 留下一个.meta.json删除标记
        const meta = await fs.create(`${uuid}.meta.json`);
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
        await fs.delete(`${uuid}.meta.json`);
      }
      logger.info("delete success");
    } catch (e) {
      logger.error("delete file error", Logger.E(e));
    }
    return;
  }

  // 上传脚本
  async pushScript(fs: FileSystem, script: PushScriptParam) {
    const filename = `${script.uuid}.user.js`;
    const logger = this.logger.with({
      uuid: script.uuid,
      name: script.name,
      file: filename,
    });
    try {
      const w = await fs.create(filename);
      // 获取脚本代码
      const code = await this.scriptCodeDAO.get(script.uuid);
      await w.write(code!.code);
      const meta = await fs.create(`${script.uuid}.meta.json`);
      await meta.write(
        JSON.stringify(<SyncMeta>{
          uuid: script.uuid,
          origin: script.origin,
          downloadUrl: script.downloadUrl,
          checkUpdateUrl: script.checkUpdateUrl,
        })
      );
      logger.info("push script success");
    } catch (e) {
      logger.error("push script error", Logger.E(e));
      throw e;
    }
    return;
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
      this.script.installScript({
        script,
        code,
        upsertBy: "sync",
      });
      logger.info("pull script success");
    } catch (e) {
      logger.error("pull script error", Logger.E(e));
    }
  }

  cloudSyncConfigChange(value: CloudSyncConfig) {
    if (value.enable) {
      // 开启云同步同步
      this.buildFileSystem(value).then(async (fs) => {
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
      this.buildFileSystem(config).then(async (fs) => {
        await this.pushScript(fs, params.script);
        this.updateFileDigest(fs);
      });
    }
  }

  async scriptsDelete(data: TDeleteScript[]) {
    // 判断是否开启了同步
    const config = await this.systemConfig.getCloudSync();
    if (config.enable) {
      this.buildFileSystem(config).then(async (fs) => {
        for (const { uuid, deleteBy } of data) {
          if (deleteBy === "sync") {
            continue;
          }
          await this.deleteCloudScript(fs, uuid, config.syncDelete);
        }
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
