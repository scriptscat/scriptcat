import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { isText } from "../utils/istextorbinary";
import { blobToBase64 } from "../utils/utils";
import { parseStorageValue } from "../utils/utils";
import type {
  BackupData,
  ResourceBackup,
  ResourceMeta,
  ScriptBackupData,
  ScriptOptionsFile,
  SubscribeBackupData,
  SubscribeOptionsFile,
  ValueStorage,
  ScriptData,
  SubscribeData,
} from "./struct";
import type { FileInfo } from "@Packages/filesystem/filesystem";
import type FileSystem from "@Packages/filesystem/filesystem";

type ViolentmonkeyFile = {
  scripts: {
    [key: string]: {
      config: {
        enabled: boolean;
      };
    };
  };
};

// 备份导入工具

export default class BackupImport {
  fs: FileSystem;

  logger: Logger;

  constructor(fileSystem: FileSystem) {
    this.fs = fileSystem;
    this.logger = LoggerCore.logger({ component: "backupImport" });
  }

  async getFileContent(file: FileInfo, toJson: boolean, type?: "string" | "blob"): Promise<string | any> {
    const fileReader = await this.fs.open(file);
    const fileContent = await fileReader.read(type);
    if (toJson) return JSON.parse(fileContent);
    return fileContent;
  }

  // 解析出备份数据
  async parse(): Promise<BackupData> {
    const map = new Map<string, ScriptBackupData>();
    const subscribe = new Map<string, SubscribeBackupData>();
    let files = await this.fs.list();

    // 处理订阅
    files = await this.dealFile(files, async (file) => {
      const { name } = file;
      if (!name.endsWith(".user.sub.js")) {
        return false;
      }
      const key = name.substring(0, name.length - 12);
      const subData = {
        source: <string>await this.getFileContent(file, false),
      } as SubscribeBackupData;
      subscribe.set(key, subData);
      return true;
    });
    // 处理订阅options
    files = await this.dealFile(files, async (file) => {
      const { name } = file;
      if (!name.endsWith(".user.sub.options.json")) {
        return false;
      }
      const key = name.substring(0, name.length - 22);
      const data = <SubscribeOptionsFile>await this.getFileContent(file, true);
      subscribe.get(key)!.options = data;
      return true;
    });

    // 先处理*.user.js文件
    files = await this.dealFile(files, async (file) => {
      const { name } = file;
      if (!name.endsWith(".user.js")) {
        return false;
      }
      // 遍历与脚本同名的文件
      const key = name.substring(0, name.length - 8);
      const backupData = {
        code: <string>await this.getFileContent(file, false),
        storage: { data: {}, ts: 0 },
        requires: [],
        requiresCss: [],
        resources: [],
      } as ScriptBackupData;
      map.set(key, backupData);
      return true;
    });
    // 处理options.json文件
    files = await this.dealFile(files, async (file) => {
      const { name } = file;
      if (!name.endsWith(".options.json")) {
        return false;
      }
      const key = name.substring(0, name.length - 13);
      const data = <ScriptOptionsFile>await this.getFileContent(file, true);
      map.get(key)!.options = data;
      return true;
    });
    // 处理storage.json文件
    files = await this.dealFile(files, async (file) => {
      const { name } = file;
      if (!name.endsWith(".storage.json")) {
        return false;
      }
      const key = name.substring(0, name.length - 13);
      const data = <ValueStorage>await this.getFileContent(file, true);
      const dataData = data.data;
      for (const dataKey of Object.keys(dataData)) {
        dataData[dataKey] = parseStorageValue(dataData[dataKey]);
      }
      map.get(key)!.storage = data;
      return true;
    });
    // 处理各种资源文件
    // 将期望的资源文件名储存到map中, 以便后续处理
    const resourceFilenameMap = new Map<
      string,
      {
        index: number;
        key: string;
        type: "resources" | "requires" | "requiresCss";
      }
    >();
    files = await this.dealFile(files, async (file) => {
      const { name } = file;
      const userJsIndex = name.indexOf(".user.js-");
      if (userJsIndex === -1) {
        return false;
      }
      const key = name.substring(0, userJsIndex);
      let type: "resources" | "requires" | "requiresCss" | "" = "";
      if (!name.endsWith(".resources.json")) {
        if (!name.endsWith(".requires.json")) {
          if (!name.endsWith(".requires.css.json")) {
            return false;
          }
          type = "requiresCss";
          resourceFilenameMap.set(name.substring(0, name.length - 18), {
            index: map.get(key)!.requiresCss.length,
            key,
            type,
          });
        } else {
          type = "requires";
          resourceFilenameMap.set(name.substring(0, name.length - 14), {
            index: map.get(key)!.requires.length,
            key,
            type,
          });
        }
      } else {
        type = "resources";
        resourceFilenameMap.set(name.substring(0, name.length - 15), {
          index: map.get(key)!.resources.length,
          key,
          type,
        });
      }
      const data = <ResourceMeta>await this.getFileContent(file, true);
      map.get(key)![type].push({
        meta: data,
      } as never as ResourceBackup);
      return true;
    });

    // 处理资源文件的内容
    let violentmonkeyFile: FileInfo | undefined;
    files = await this.dealFile(files, async (file) => {
      if (file.name === "violentmonkey") {
        violentmonkeyFile = file;
        return true;
      }
      const info = resourceFilenameMap.get(file.name);
      if (info === undefined) {
        return false;
      }
      const resource = map.get(info.key)![info.type][info.index];
      resource.base64 = await blobToBase64(await this.getFileContent(file, false, "blob"));
      if (resource.meta) {
        // 存在meta
        // 替换base64前缀
        if (resource.meta.mimetype) {
          resource.base64 = resource.base64.replace(/^data:.*?;base64,/, `data:${resource.meta.mimetype};base64,`);
        }
        if (isText(await (await this.fs.open(file)).read("blob"))) {
          resource.source = await (await this.fs.open(file)).read();
        }
      }
      return true;
    });

    files.length &&
      this.logger.warn("unhandled files", {
        num: files.length,
        files: files.map((f) => f.name),
      });

    // 处理暴力猴导入资源
    if (violentmonkeyFile) {
      try {
        const data = (await this.getFileContent(violentmonkeyFile, true, "string")) as ViolentmonkeyFile;
        // 设置开启状态
        const scripts = data.scripts;
        for (const key of Object.keys(scripts)) {
          const vioScript = scripts[key];
          if (!vioScript.config.enabled) {
            const script = map.get(key);
            if (!script) {
              continue;
            }
            script.enabled = false;
          }
        }
      } catch (e) {
        this.logger.error("violentmonkey file parse error", Logger.E(e));
      }
    }

    // 将map转化为数组
    return {
      script: <ScriptData[]>Array.from(map.values()),
      subscribe: <SubscribeData[]>Array.from(subscribe.values()),
    };
  }

  async dealFile(files: FileInfo[], handler: (file: FileInfo) => Promise<boolean>): Promise<FileInfo[]> {
    const newFiles: FileInfo[] = [];
    const results = await Promise.all(files.map(handler));
    results.forEach((result, index) => {
      if (!result) {
        newFiles.push(files[index]);
      }
    });
    return newFiles;
  }
}
