import IoC from "@App/app/ioc";
import MessageInternal from "@App/app/message/internal";
import JSZip from "jszip";
import ZipFileSystem from "@Pkg/filesystem/zip/zip";
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
          const resp = await this.dispatchEvent("openImportWindow", {
            filename: file.name,
            url,
          });
          return resolve(resp);
        } catch (e) {
          return reject(e);
        }
      };
      el.click();
    });
  }

  fetchImportInfo(uuid: string) {
    return this.dispatchEvent("fetchImportInfo", uuid);
  }

  import(zip: JSZip) {
    const system = new ZipFileSystem(zip);
    // 解析文件
    system.list();
  }
}
