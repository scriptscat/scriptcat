import IoC from "@App/app/ioc";
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
import { SystemConfig } from "@App/pkg/config/config";
import FileSystem from "@Pkg/filesystem/filesystem";
import Manager from "../manager";
import ResourceManager from "../resource/manager";
import ValueManager from "../value/manager";
import SynchronizeEventListener from "./event";

export type SynchronizeTarget = "local";

// 同步控件
@IoC.Singleton(MessageHander, SystemConfig, ValueManager, ResourceManager)
export default class SynchronizeManager extends Manager {
  systemConfig: SystemConfig;

  event: SynchronizeEventListener;

  scriptDAO: ScriptDAO = new ScriptDAO();

  valueManager: ValueManager;

  resourceManager: ResourceManager;

  constructor(
    center: MessageHander,
    systemConfig: SystemConfig,
    valueManager: ValueManager,
    resourceManager: ResourceManager
  ) {
    super(center);
    this.systemConfig = systemConfig;
    this.event = new SynchronizeEventListener(this);
    this.valueManager = valueManager;
    this.resourceManager = resourceManager;
  }

  start() {}

  // 生成备份文件到文件系统
  async backup(fs: FileSystem) {
    // 生成导出数据
    const data: BackupData = {
      script: await this.generateScriptBackupData(),
      subscribe: [],
    };

    await new BackupExport(fs).export(data);
  }

  async generateScriptBackupData() {
    // 获取所有脚本
    const list = await this.scriptDAO.table.toArray();
    const result = list.map(async (script): Promise<ScriptBackupData> => {
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
            // NOTE: tm会对同名的uuid校验,先屏蔽了
            // uuid: script.uuid,
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
    });
    return Promise.all(result);
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
    let t = url.indexOf("?");
    if (t !== -1) {
      url = url.substring(0, t);
    }
    t = url.lastIndexOf("/");
    if (t !== -1) {
      url = url.substring(t + 1);
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
