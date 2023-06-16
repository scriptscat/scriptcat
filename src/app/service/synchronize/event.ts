import Cache from "@App/app/cache";
import { v4 as uuidv4 } from "uuid";
import CacheKey from "@App/pkg/utils/cache_key";
import JSZip from "jszip";
import ZipFileSystem from "@Pkg/filesystem/zip/zip";
import dayjs from "dayjs";
import FileSystemFactory, { FileSystemType } from "@Pkg/filesystem/factory";
import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { Handler } from "../manager";
import SynchronizeManager from "./manager";

export type SynchronizeEvent =
  | "openImportWindow"
  | "fetchImportInfo"
  | "backup"
  | "backupToCloud";

export default class SynchronizeEventListener {
  manager: SynchronizeManager;

  logger: Logger;

  constructor(manager: SynchronizeManager) {
    this.manager = manager;
    this.logger = LoggerCore.getLogger({
      component: "SynchronizeEventListener",
    });
    this.init();
  }

  listenEvent(event: SynchronizeEvent, handler: Handler) {
    this.manager.listenEvent(event, handler);
  }

  init() {
    this.listenEvent("openImportWindow", this.importHandler.bind(this));
    this.listenEvent("fetchImportInfo", this.fetchImportInfoHandler.bind(this));
    this.listenEvent("backup", this.backupHandler.bind(this));
    this.listenEvent("backupToCloud", this.backupToCloudHandler.bind(this));
  }

  public importHandler(data: any) {
    // 生成uuid,将url保存到缓存中
    const uuid = uuidv4();
    const key = CacheKey.importInfo(uuid);
    Cache.getInstance().set(key, data);
    setTimeout(() => {
      Cache.getInstance().del(key);
    }, 60 * 100000);
    chrome.tabs.create({
      url: `/src/import.html?uuid=${uuid}`,
    });
    return Promise.resolve({ uuid });
  }

  public fetchImportInfoHandler(uuid: string) {
    return Promise.resolve(Cache.getInstance().get(CacheKey.importInfo(uuid)));
  }

  // 生成备份文件
  public async backupHandler(ids?: number[]) {
    const zip = new JSZip();
    const fs = new ZipFileSystem(zip);
    await this.manager.backup(fs, ids);
    // 生成文件,并下载
    const files = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: {
        level: 9,
      },
      comment: "Created by Scriptcat",
    });
    const url = URL.createObjectURL(files);
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60 * 1000);
    chrome.downloads.download({
      url,
      saveAs: true,
      filename: `scriptcat-backup-${dayjs().format("YYYY-MM-DDTHH-mm-ss")}.zip`,
    });
    return Promise.resolve();
  }

  // 备份到云端
  public async backupToCloudHandler({
    type,
    params,
  }: {
    type: FileSystemType;
    params: any;
  }) {
    // 首先生成zip文件
    const zip = new JSZip();
    const fs = new ZipFileSystem(zip);
    await this.manager.backup(fs);
    this.logger.info("backup to cloud");
    // 然后创建云端文件系统
    let cloudFs = await FileSystemFactory.create(type, params);
    try {
      await cloudFs.createDir("ScriptCat");
      cloudFs = await cloudFs.openDir("ScriptCat");
      // 云端文件系统写入文件
      const file = await cloudFs.create(
        `scriptcat-backup-${dayjs().format("YYYY-MM-DDTHH-mm-ss")}.zip`
      );
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
}
