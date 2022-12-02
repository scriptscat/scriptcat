import FileSystem from "@Pkg/filesystem/filesystem";
import crypto from "crypto-js";
import { base64ToBlob } from "../utils/script";
import { toStorageValueStr } from "../utils/utils";
import {
  BackupData,
  ResourceBackup,
  ScriptBackupData,
  SubscribeBackupData,
} from "./struct";

export default class BackupExport {
  fs: FileSystem;

  constructor(fileSystem: FileSystem) {
    this.fs = fileSystem;
  }

  // 导出备份数据
  export(data: BackupData): Promise<void> {
    // 写入脚本备份
    const results: Promise<void>[] = [];
    data.script.forEach((item) => {
      results.push(this.writeScript(item));
    });
    data.subscribe.forEach((item) => {
      results.push(this.writeSubscribe(item));
    });
    return Promise.all(results).then(() => undefined);
  }

  async writeScript(script: ScriptBackupData) {
    const { name } = script.options!.meta;
    // 写脚本文件
    await (await this.fs.create(`${name}.user.js`)).write(script.code);
    // 写入脚本options.json
    await (
      await this.fs.create(`${name}.options.json`)
    ).write(JSON.stringify(script.options));
    // 写入脚本storage.json
    // 不想兼容tm的导出规则了,直接写入storage.json
    const storage = { ...script.storage };
    Object.keys(storage.data).forEach((key: string) => {
      storage.data[key] = toStorageValueStr(storage.data[key]);
    });
    await (
      await this.fs.create(`${name}.storage.json`)
    ).write(JSON.stringify(storage));
    // 写入脚本资源文件
    await this.writeResource(name, script.resources, "resources");
    await this.writeResource(name, script.requires, "requires");
    await this.writeResource(name, script.requiresCss, "requires.css");

    return Promise.resolve();
  }

  async writeResource(
    name: string,
    resources: ResourceBackup[],
    type: "resources" | "requires" | "requires.css"
  ): Promise<void[]> {
    const results: Promise<void>[] = resources.map(async (item) => {
      // md5是tm的导出规则
      const md5 = crypto.MD5(`${type}{val.meta.url}`).toString();
      if (item.source) {
        await (
          await this.fs.create(`${name}.user.js-${md5}-${item.meta.name}`)
        ).write(item.source!);
      } else {
        await (
          await this.fs.create(`${name}.user.js-${md5}-${item.meta.name}`)
        ).write(base64ToBlob(item.base64));
      }
      (
        await this.fs.create(
          `${name}.user.js-${md5}-${item.meta.name}.${type}.json`
        )
      ).write(JSON.stringify(item.meta));
    });
    return Promise.all(results);
  }

  async writeSubscribe(subscribe: SubscribeBackupData) {
    const { name } = subscribe.options!.meta;
    // 写入订阅文件
    await (await this.fs.create(`${name}.user.sub.js`)).write(subscribe.source);
    // 写入订阅options.json
    await (
      await this.fs.create(`${name}.user.sub.options.json`)
    ).write(JSON.stringify(subscribe.options));

    return Promise.resolve();
  }
}
