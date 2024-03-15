import IoC from "@App/app/ioc";
import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { MessageHander } from "@App/app/message/message";
import { Resource } from "@App/app/repo/resource";
import { Script, SCRIPT_STATUS_ENABLE, ScriptDAO } from "@App/app/repo/scripts";
import BackupExport from "@App/pkg/backup/export";
import {
  BackupData,
  ResourceBackup,
  ScriptBackupData,
  ScriptOptions,
  ValueStorage,
} from "@App/pkg/backup/struct";
import ChromeStorage from "@App/pkg/config/chrome_storage";
import { CloudSyncConfig, SystemConfig } from "@App/pkg/config/config";
import { prepareScriptByCode } from "@App/pkg/utils/script";
import { errorMsg, InfoNotification } from "@App/pkg/utils/utils";
import FileSystemFactory from "@Pkg/filesystem/factory";
import FileSystem, { File } from "@Pkg/filesystem/filesystem";
import { t } from "i18next";
import { isWarpTokenError } from "@Pkg/filesystem/error";
import Manager from "../manager";
import ResourceManager from "../resource/manager";
import ScriptManager from "../script/manager";
import ValueManager from "../value/manager";
import SynchronizeEventListener from "./event";

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

// 同步控件
@IoC.Singleton(
  MessageHander,
  SystemConfig,
  ValueManager,
  ResourceManager,
  ScriptManager
)
export default class SynchronizeManager extends Manager {
  systemConfig: SystemConfig;

  event: SynchronizeEventListener;

  scriptManager: ScriptManager;

  scriptDAO: ScriptDAO = new ScriptDAO();

  valueManager: ValueManager;

  resourceManager: ResourceManager;

  logger: Logger;

  storage: ChromeStorage;

  constructor(
    center: MessageHander,
    systemConfig: SystemConfig,
    valueManager: ValueManager,
    resourceManager: ResourceManager,
    scriptManager: ScriptManager
  ) {
    super(center, "sync");
    this.systemConfig = systemConfig;
    this.event = new SynchronizeEventListener(this);
    this.valueManager = valueManager;
    this.resourceManager = resourceManager;
    this.scriptManager = scriptManager;
    this.storage = new ChromeStorage("sync", false);
    this.logger = LoggerCore.getLogger({ component: "SynchronizeManager" });
  }

  async start() {
    // 监听同步事件决定是否开启同步
    let freeSync: () => void | undefined;
    this.systemConfig.awaitLoad().then(async () => {
      if (this.systemConfig.cloudSync.enable) {
        freeSync = await this.enableCloudSync(this.systemConfig.cloudSync);
      }
    });
    SystemConfig.hook.addListener(
      "update",
      async (key, value: CloudSyncConfig) => {
        if (key === "cloud_sync") {
          freeSync?.();
          if (value.enable) {
            // 每次开启前进行一次全量同步,删除文件摘要
            await this.storage.set("file_digest", {});
            freeSync = await this.enableCloudSync(value);
          }
        }
      }
    );
  }

  // 开启云同步
  async enableCloudSync(config: CloudSyncConfig) {
    const logger = this.logger.with({ syncDelete: config.syncDelete });
    logger.info("start cloud sync");

    let fs: FileSystem;
    try {
      fs = await FileSystemFactory.create(
        config.filesystem,
        config.params[config.filesystem]
      );
      // 创建base目录
      await FileSystemFactory.mkdirAll(fs, "ScriptCat/sync");
      fs = await fs.openDir("ScriptCat/sync");
    } catch (e: any) {
      logger.error("create filesystem error", Logger.E(e), {
        type: config.filesystem,
      });
      // 判断错误是不是网络类型的错误, 网络类型的错误不做任何处理
      // 如果是token失效之类的错误,通知用户并关闭云同步
      if (isWarpTokenError(e)) {
        InfoNotification(
          `${t("sync_system_connect_failed")}, ${t("sync_system_closed")}`,
          `${t("sync_system_closed_description")}\n${errorMsg(e)}`
        );
        this.systemConfig.cloudSync = {
          ...this.systemConfig.cloudSync,
          enable: false,
        };
      }
      throw e;
    }

    const freeFn: (() => void)[] = [];
    // 监听脚本更新事件
    const upsertFn = async (script: Script, upsertBy: string) => {
      if (upsertBy === "sync") {
        return;
      }
      await this.pushScript(fs, script);
      this.updateFileDigest(fs);
    };
    freeFn.push(() => ScriptManager.hook.removeListener("upsert", upsertFn));
    ScriptManager.hook.addListener("upsert", upsertFn);

    // 监听脚本删除事件
    const deleteFn = (script: Script) => {
      this.deleteCloudScript(fs, script, config.syncDelete);
    };
    ScriptManager.hook.addListener("delete", deleteFn);
    freeFn.push(() => ScriptManager.hook.removeListener("delete", deleteFn));

    // 先设置固定一小时同步一次吧
    const ts = setInterval(async () => {
      try {
        await this.syncOnce(fs);
      } catch (e: any) {
        this.logger.error("sync error", Logger.E(e));
      }
    }, 60 * 60 * 1000);
    freeFn.push(() => {
      clearInterval(ts);
    });

    try {
      await this.syncOnce(fs);
    } catch (e: any) {
      this.logger.error("sync error", Logger.E(e));
    }
    return Promise.resolve(() => {
      logger.info("stop cloud sync");
      // 当停止云同步时,移除监听
      freeFn.forEach((fn) => fn());
    });
  }

  // 同步一次
  async syncOnce(fs: FileSystem): Promise<void> {
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
    const scriptList = await this.scriptDAO.table.toArray();
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
                    this.scriptManager.event.deleteHandler(script.id);
                    InfoNotification(
                      "脚本删除同步",
                      `脚本${script.name}已被删除`
                    );
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
    // 忽略错误
    await Promise.allSettled(result);
    // 上传剩下的脚本
    scriptMap.forEach((script) => {
      result.push(this.pushScript(fs, script));
    });
    // 重新获取文件列表,保存文件摘要
    this.logger.info("sync complete");
    await this.updateFileDigest(fs);
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
  async deleteCloudScript(fs: FileSystem, script: Script, syncDelete: boolean) {
    const filename = `${script.uuid}.user.js`;
    const logger = this.logger.with({
      scriptId: script.id,
      name: script.name,
      file: filename,
    });
    try {
      await fs.delete(filename);
      if (syncDelete) {
        // 留下一个.meta.json删除标记
        const meta = await fs.create(`${script.uuid}.meta.json`);
        await meta.write(
          JSON.stringify(<SyncMeta>{
            uuid: script.uuid,
            origin: script.origin,
            downloadUrl: script.downloadUrl,
            checkUpdateUrl: script.checkUpdateUrl,
            isDeleted: true,
          })
        );
      } else {
        // 直接删除所有相关文件
        await fs.delete(filename);
        await fs.delete(`${script.uuid}.meta.json`);
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
      scriptId: script.id,
      name: script.name,
      file: filename,
    });
    try {
      const w = await fs.create(filename);
      await w.write(script.code);
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
      scriptId: script?.id || -1,
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
      prepareScript.script.origin =
        prepareScript.script.origin || metaObj.origin;
      this.scriptManager.event.upsertHandler(prepareScript.script, "sync");
      logger.info("pull script success");
    } catch (e) {
      logger.error("pull script error", Logger.E(e));
    }
    return Promise.resolve();
  }

  // 生成备份文件到文件系统
  async backup(fs: FileSystem, ids?: number[]) {
    // 生成导出数据
    const data: BackupData = {
      script: await this.getScriptBackupData(ids),
      subscribe: [],
    };

    await new BackupExport(fs).export(data);
  }

  async getScriptBackupData(ids?: number[]) {
    // 获取所有脚本
    if (!ids) {
      const list = await this.scriptDAO.table.toArray();
      return Promise.all(
        list.map(
          async (script): Promise<ScriptBackupData> =>
            this.generateScriptBackupData(script)
        )
      );
    }
    const rets: Promise<ScriptBackupData>[] = [];
    ids.forEach((id) => {
      rets.push(
        new Promise<ScriptBackupData>((resolve, reject) => {
          this.scriptDAO
            .findById(id)
            .then((script) => {
              if (script) {
                resolve(this.generateScriptBackupData(script));
              }
            })
            .catch((e) => {
              reject(e);
            });
        })
      );
    });
    return Promise.all(rets);
  }

  async generateScriptBackupData(script: Script): Promise<ScriptBackupData> {
    const ret = {
      code: script.code,
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
    const values = await this.valueManager.getValues(script);
    Object.keys(values).forEach((key) => {
      storage.data[key] = values[key].value;
    });
    const requires = await this.resourceManager.getRequireResource(script);
    const requiresCss = await this.resourceManager.getRequireCssResource(
      script
    );
    const resources = await this.resourceManager.getResourceResource(script);

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
        orig_run_at:
          (script.metadata.run_at && script.metadata.run_at[0]) ||
          "document-idle",
        use_blockers: [],
        use_connects: [],
        use_excludes: [],
        use_includes: [],
        use_matches: [],
      },
      run_at: null,
    };
  }
}
