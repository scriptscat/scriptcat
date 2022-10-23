import { ScriptRunResouce } from "@App/app/repo/scripts";

export type SynchronizeType = "zip-file" | "json-file" | "webdav";

export type SynchronizeScript = ScriptRunResouce;

export interface Synchronize {
  type: SynchronizeType;
  // 写入脚本
  writeScript(script: SynchronizeScript): Promise<void>;
  

  upload(): Promise<void>;
  // 下载
  download(): Promise<void>;
  // 打包
  package(): Promise<void>;
  // 解包
  unpackage(): Promise<void>;
}

export default class SynchronizeFactory {
  static create(type: SynchronizeType, options: any): Synchronize {
    switch (type) {
      case "zip-file":
        return new ZipFileSynchronize(options);
      case "json-file":
        return new JsonFileSynchronize(options);
      case "webdav":
        return new WebDavSynchronize(options);
      default:
        throw new Error("Unknown Synchronize Type");
    }
  }
}
