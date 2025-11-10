import type FileSystem from "@Packages/filesystem/filesystem";
import { base64ToBlob } from "../utils/utils";
import { toStorageValueStr } from "../utils/utils";
import type { BackupData, ResourceBackup, ScriptBackupData, SubscribeBackupData } from "./struct";
import { md5OfText } from "../utils/crypto";
import type { FileCreateOptions } from "@Packages/filesystem/filesystem";

export default class BackupExport {
  fs: FileSystem;

  constructor(fileSystem: FileSystem) {
    this.fs = fileSystem;
  }

  // 导出备份数据
  export(data: BackupData): Promise<void> {
    // 写入脚本备份
    return Promise.all([
      ...data.script.flatMap((item) => this.writeScript(item)),
      ...data.subscribe.flatMap((item) => this.writeSubscribe(item)),
    ]).then(() => {
      return;
    });
  }

  writeScript(script: ScriptBackupData): Promise<void>[] {
    const { name } = script.options!.meta;
    // 将脚本名中的特殊字符替换为下划线
    const filename = name.replace(/[\\/\\:*?"<>|]/g, "_");

    // 写脚本文件
    const writeCode = script.code;

    // 写入脚本options.json
    const writeOptions = JSON.stringify(script.options);

    // 写入脚本storage.json
    // 不想兼容tm的导出规则了,直接写入storage.json
    const storage = { ...script.storage };
    const data = storage.data;
    for (const key of Object.keys(data)) {
      data[key] = toStorageValueStr(data[key]);
    }
    const wrtieStorage = JSON.stringify(storage);

    const fileOpts = { modifiedDate: script.lastModificationDate } as FileCreateOptions;
    return [
      // 写脚本文件
      this.fs.create(`${filename}.user.js`, fileOpts).then((fileWriter) => fileWriter.write(writeCode)),
      // 写入脚本options.json
      this.fs.create(`${filename}.options.json`, fileOpts).then((fileWriter) => fileWriter.write(writeOptions)),
      // 写入脚本storage.json
      this.fs.create(`${filename}.storage.json`, fileOpts).then((fileWriter) => fileWriter.write(wrtieStorage)),
      // 写入脚本资源文件
      ...this.writeResource(filename, script.resources, "resources", fileOpts),
      ...this.writeResource(filename, script.requires, "requires", fileOpts),
      ...this.writeResource(filename, script.requiresCss, "requires.css", fileOpts),
    ];
  }

  writeResource(
    filename: string,
    resources: ResourceBackup[],
    type: "resources" | "requires" | "requires.css",
    fileOpts: FileCreateOptions
  ): Promise<void>[] {
    return resources.flatMap((item) => {
      // md5是tm的导出规则
      const md5 = md5OfText(`${type}{val.meta.url}`);
      const writeSource = item.source || base64ToBlob(item.base64);
      const writeMeta = JSON.stringify(item.meta);
      return [
        this.fs
          .create(`${filename}.user.js-${md5}-${item.meta.name}`, fileOpts)
          .then((fileWriter) => fileWriter.write(writeSource)),
        this.fs
          .create(`${filename}.user.js-${md5}-${item.meta.name}.${type}.json`, fileOpts)
          .then((fileWriter) => fileWriter.write(writeMeta)),
      ];
    });
  }

  writeSubscribe(subscribe: SubscribeBackupData): Promise<void>[] {
    const { name } = subscribe.options!.meta;
    // 将订阅名中的特殊字符替换为下划线
    const filename = name.replace(/[\\/\\:*?"<>|]/g, "_");
    const writeSource = subscribe.source;
    const writeOptions = JSON.stringify(subscribe.options);
    return [
      // 写入订阅文件
      this.fs.create(`${filename}.user.sub.js`).then((fileWriter) => fileWriter.write(writeSource)),
      // 写入订阅options.json
      this.fs.create(`${filename}.user.sub.options.json`).then((fileWriter) => fileWriter.write(writeOptions)),
    ];
  }
}
