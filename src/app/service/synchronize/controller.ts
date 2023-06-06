import IoC from "@App/app/ioc";
import MessageInternal from "@App/app/message/internal";
import JSZip from "jszip";
import ZipFileSystem from "@Pkg/filesystem/zip/zip";
import BackupImport from "@App/pkg/backup/import";
import { FileSystemType } from "@Pkg/filesystem/factory";
import { SynchronizeEvent } from "./event";

@IoC.Singleton(MessageInternal)
export default class SynchronizeController {
  internal: MessageInternal;

  constructor(internal: MessageInternal) {
    this.internal = internal;
  }

  public dispatchEvent(event: SynchronizeEvent, data: any): Promise<any> {
    return this.internal.syncSend(`sync-${event}`, data);
  }

  public openImportFile(el: HTMLInputElement): Promise<boolean> {
    return new Promise((resolve, reject) => {
      el.onchange = async () => {
        const { files } = el;
        if (!files) {
          return reject(new Error("no file"));
        }
        const file = files[0];
        if (!file) {
          return reject(new Error("no file"));
        }
        const url = URL.createObjectURL(file);
        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 60 * 100000);
        try {
          const resp = await this.openImportWindow(file.name, url);
          return resolve(resp);
        } catch (e) {
          return reject(e);
        }
      };
      el.click();
    });
  }

  openImportWindow(filename: string, url: string) {
    return this.dispatchEvent("openImportWindow", {
      filename,
      url,
    });
  }

  fetchImportInfo(uuid: string) {
    return this.dispatchEvent("fetchImportInfo", uuid);
  }

  // 解析备份文件
  parseBackup(zip: JSZip) {
    const fs = new ZipFileSystem(zip);
    // 解析文件
    return new BackupImport(fs).parse();
  }

  backup(ids?: number[]) {
    return this.dispatchEvent("backup", ids);
  }

  backupToCloud(type: FileSystemType, params: any) {
    return this.dispatchEvent("backupToCloud", { type, params });
  }
}
