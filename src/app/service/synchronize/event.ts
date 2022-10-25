import Cache from "@App/app/cache";
import { v4 as uuidv4 } from "uuid";
import CacheKey from "@App/pkg/utils/cache_key";
import JSZip from "jszip";
import ZipFileSystem from "@Pkg/filesystem/zip/zip";
import dayjs from "dayjs";
import { BackupData } from "@App/pkg/backup/struct";
import { Handler } from "../manager";
import SynchronizeManager from "./manager";

export type SynchronizeEvent =
  | "openImportWindow"
  | "fetchImportInfo"
  | "backup"
  | "restore";

export default class SynchronizeEventListener {
  manager: SynchronizeManager;

  constructor(manager: SynchronizeManager) {
    this.manager = manager;
    this.init();
  }

  listenEvent(event: SynchronizeEvent, handler: Handler) {
    this.manager.listenEvent(`sync-${event}`, handler);
  }

  init() {
    this.listenEvent("openImportWindow", this.importHandler.bind(this));
    this.listenEvent("fetchImportInfo", this.fetchImportInfoHandler.bind(this));
    this.listenEvent("backup", this.backupHandler.bind(this));
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
      url: `src/import.html?uuid=${uuid}`,
    });
    return Promise.resolve({ uuid });
  }

  public fetchImportInfoHandler(uuid: string) {
    return Promise.resolve(Cache.getInstance().get(CacheKey.importInfo(uuid)));
  }

  // 生成备份文件
  public async backupHandler() {
    const zip = new JSZip();
    const fs = new ZipFileSystem(zip);
    await this.manager.backup(fs);
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
    chrome.downloads.download(
      {
        url,
        filename: `scriptcat-backup ${dayjs().format()}.zip`,
      },
      () => {
        // 返回信息
      }
    );
    return Promise.resolve();
  }

  public async restoreHandler(data: BackupData) {
    await this.manager.restore(data);
    return Promise.resolve();
  }
}
