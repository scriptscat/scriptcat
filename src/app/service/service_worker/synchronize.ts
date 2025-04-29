import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { Resource } from "@App/app/repo/resource";
import { Script, SCRIPT_STATUS_ENABLE, ScriptCodeDAO, ScriptDAO } from "@App/app/repo/scripts";
import BackupExport from "@App/pkg/backup/export";
import { BackupData, ResourceBackup, ScriptBackupData, ScriptOptions, ValueStorage } from "@App/pkg/backup/struct";
import FileSystem, { File } from "@Packages/filesystem/filesystem";
import ZipFileSystem from "@Packages/filesystem/zip/zip";
import { Group, MessageSend } from "@Packages/message/server";
import JSZip from "jszip";
import { ValueService } from "./value";
import { ResourceService } from "./resource";
import dayjs from "dayjs";
import { createObjectURL } from "../offscreen/client";
import FileSystemFactory, { FileSystemType } from "@Packages/filesystem/factory";
import { CloudSyncConfig, SystemConfig } from "@App/pkg/config/config";
import { MessageQueue } from "@Packages/message/message_queue";
import { subscribeScriptDelete, subscribeScriptInstall } from "../queue";
import { isWarpTokenError } from "@Packages/filesystem/error";
import { errorMsg, InfoNotification } from "@App/pkg/utils/utils";
import { t } from "i18next";
import ChromeStorage from "@App/pkg/config/chrome_storage";
import { ScriptService } from "./script";
import { prepareScriptByCode } from "@App/pkg/utils/script";
import { InstallSource } from ".";

export type SynchronizeTarget = "local";

type SyncFiles = {
  script: File;
  meta: File;
};

export type SyncMeta = {
  uuid: string;
  origin?: string; // 脚本来源
  downloadUrl?: string;
  checkUpdateUrl?: string;
  isDeleted?: boolean;
};

export class SynchronizeService {
  logger: Logger;

  scriptDAO = new ScriptDAO();
  scriptCodeDAO = new ScriptCodeDAO();

  storage: ChromeStorage = new ChromeStorage("sync", true);

  constructor(
    private send: MessageSend,
    private group: Group,
    private script: ScriptService,
    private value: ValueService,
    private resource: ResourceService,
    private mq: MessageQueue,
    private systemConfig: SystemConfig
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
      return Promise.all(rets);
    }
    // 获取所有脚本
    const list = await this.scriptDAO.all();
    return Promise.all(list.map(async (script): Promise<ScriptBackupData> => this.generateScriptBackupData(script)));
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
      ts: new Date().getTime(),
    };
    const values = await this.value.getScriptValue(script);
    Object.keys(values).forEach((key) => {
      storage.data[key] = values[key];
    });

    const requires = await this.resource.getResourceByType(script, "require");
    const requiresCss = await this.resource.getResourceByType(script, "require-css");
    const resources = await this.resource.getResourceByType(script, "resource");

    ret.requires = this.resourceToBackdata(requires);
    ret.requiresCss = this.resourceToBackdata(requiresCss);
    ret.resources = this.resourceToBackdata(resources);

    ret.storage = storage;
    return Promise.resolve(ret);
  }

  resourceToBackdata(resource: { [key: string]: Resource }) {
    const ret: ResourceBackup[] = [];
    Object.keys(resource).forEach((key) => {
      ret.push({
        meta: {
          name: this.getUrlName(resource[key].url),
          url: resource[key].url,
          ts: resource[key].updatetime || resource[key].createtime,
          mimetype: resource[key].contentType,
        },
        source: resource[key]!.content || undefined,
        base64: resource[key]!.base64,
      });
    });
    return ret;
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
        orig_noframes: script.metadata.noframe ? true : null,
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
    const url = await createObjectURL(this.send, files);
    chrome.downloads.download({
      url,
      saveAs: true,
      filename: `scriptcat-backup-${dayjs().format("YYYY-MM-DDTHH-mm-ss")}.zip`,
    });
    return Promise.resolve();
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
      const file = await cloudFs.create(`scriptcat-backup-${dayjs().format("YYYY-MM-DDTHH-mm-ss")}.zip`);
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
      return Promise.reject(e);
    }
    return Promise.resolve();
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
  async syncOnce(fs: FileSystem) {
    this.logger.info("start sync once");
    // 获取文件列表
    const list = await fs.list();
    // 根据文件名生成一个map
    const uuidMap = new Map<
      string,
      {
        script?: File;
        meta?: File;
      }
    >();
    // 储存文件摘要,用于检测文件是否有变化
    const fileDigestMap =
      ((await this.storage.get("file_digest")) as {
        [key: string]: string;
      }) || {};

    list.forEach((file) => {
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
    });

    // 获取脚本列表
    const scriptList = await this.scriptDAO.all();
    // 遍历脚本列表生成一个map
    const scriptMap = new Map<string, Script>();
    scriptList.forEach((script) => {
      scriptMap.set(script.uuid, script);
    });
    // 对比脚本列表和文件列表,进行同步
    const result: Promise<void>[] = [];
    uuidMap.forEach((file, uuid) => {
      const script = scriptMap.get(uuid);
      if (script) {
        // 脚本存在但是文件不存在,则读取.meta.json内容判断是否需要删除脚本
        if (!file.script) {
          result.push(
            new Promise((resolve) => {
              const handler = async () => {
                // 读取meta文件
                const meta = await fs.open(file.meta!);
                const metaJson = (await meta.read("string")) as string;
                const metaObj = JSON.parse(metaJson) as SyncMeta;
                if (metaObj.isDeleted) {
                  if (script) {
                    this.script.deleteScript(script.uuid);
                    InfoNotification("脚本删除同步", `脚本${script.name}已被删除`);
                  }
                  scriptMap.delete(uuid);
                } else {
                  // 否则认为是一个无效的.meta文件,进行删除
                  await fs.delete(file.meta!.path);
                }
                resolve();
              };
              handler();
            })
          );
          return;
        }
        // 过滤掉无变动的文件
        if (fileDigestMap[file.script!.name] === file.script!.digest) {
          // 删除了之后,剩下的就是需要上传的脚本了
          scriptMap.delete(uuid);
          return;
        }
        const updatetime = script.updatetime || script.createtime;
        // 对比脚本更新时间和文件更新时间
        if (updatetime > file.script!.updatetime) {
          // 如果脚本更新时间大于文件更新时间,则上传文件
          result.push(this.pushScript(fs, script));
        } else {
          // 如果脚本更新时间小于文件更新时间,则更新脚本
          result.push(this.pullScript(fs, file as SyncFiles, script));
        }
        scriptMap.delete(uuid);
        return;
      }
      // 如果脚本不存在,且文件存在,则安装脚本
      if (file.script) {
        result.push(this.pullScript(fs, file as SyncFiles));
      }
    });
    // 上传剩下的脚本
    scriptMap.forEach((script) => {
      result.push(this.pushScript(fs, script));
    });
    // 忽略错误
    await Promise.allSettled(result);
    // 重新获取文件列表,保存文件摘要
    await this.updateFileDigest(fs);
    this.logger.info("sync complete");
    return Promise.resolve();
  }

  async updateFileDigest(fs: FileSystem) {
    const newList = await fs.list();
    const newFileDigestMap: { [key: string]: string } = {};
    newList.forEach((file) => {
      newFileDigestMap[file.name] = file.digest;
    });
    await this.storage.set("file_digest", newFileDigestMap);
    return Promise.resolve();
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
        await fs.delete(filename);
        await fs.delete(`${uuid}.meta.json`);
      }
      logger.info("delete success");
    } catch (e) {
      logger.error("delete file error", Logger.E(e));
    }
    return Promise.resolve();
  }

  // 上传脚本
  async pushScript(fs: FileSystem, script: Script) {
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
    return Promise.resolve();
  }

  async pullScript(fs: FileSystem, file: SyncFiles, script?: Script) {
    const logger = this.logger.with({
      uuid: script?.uuid || "",
      name: script?.name || "",
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
      const prepareScript = await prepareScriptByCode(
        code,
        script?.downloadUrl || metaObj.downloadUrl || "",
        script?.uuid || metaObj.uuid
      );
      prepareScript.script.origin = prepareScript.script.origin || metaObj.origin;
      this.script.installScript({
        script: prepareScript.script,
        code: code,
        upsertBy: "sync",
      });
      logger.info("pull script success");
    } catch (e) {
      logger.error("pull script error", Logger.E(e));
    }
    return Promise.resolve();
  }

  cloudSyncConfigChange(value: CloudSyncConfig) {
    if (value.enable) {
      // 开启云同步同步
      this.buildFileSystem(value).then(async (fs) => {
        await this.syncOnce(fs);
        // 开启定时器, 一小时一次
        chrome.alarms.create("cloudSync", {
          periodInMinutes: 60,
        });
      });
    } else {
      // 停止计时器
      chrome.alarms.clear("cloudSync");
    }
  }

  async scriptInstall(params: { script: Script; update: boolean; upsertBy: InstallSource }) {
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

  async scriptDelete(script: { uuid: string }) {
    // 判断是否开启了同步
    const config = await this.systemConfig.getCloudSync();
    if (config.enable) {
      this.buildFileSystem(config).then(async (fs) => {
        await this.deleteCloudScript(fs, script.uuid, config.syncDelete);
      });
    }
  }

  init() {
    this.group.on("export", this.requestExport.bind(this));
    this.group.on("backupToCloud", this.backupToCloud.bind(this));
    // this.group.on("import", this.openImportWindow.bind(this));
    // 监听脚本变化, 进行同步
    subscribeScriptInstall(this.mq, this.scriptInstall.bind(this));
    subscribeScriptDelete(this.mq, this.scriptDelete.bind(this));
  }
}
