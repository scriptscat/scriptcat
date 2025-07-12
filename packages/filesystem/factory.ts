import BaiduFileSystem from "./baidu/baidu";
import type FileSystem from "./filesystem";
import GoogleDriveFileSystem from "./googledrive/googledrive";
import OneDriveFileSystem from "./onedrive/onedrive";
import WebDAVFileSystem from "./webdav/webdav";
import ZipFileSystem from "./zip/zip";
import { t } from "@App/locales/locales";

export type FileSystemType = "zip" | "webdav" | "baidu-netdsik" | "onedrive" | "googledrive";

export type FileSystemParams = {
  [key: string]: {
    title: string;
    type?: "select" | "authorize" | "password";
    options?: string[];
  };
};

export default class FileSystemFactory {
  static create(type: FileSystemType, params: any): Promise<FileSystem> {
    let fs: FileSystem;
    switch (type) {
      case "zip":
        fs = new ZipFileSystem(params);
        break;
      case "webdav":
        fs = new WebDAVFileSystem(
          params.authType,
          params.url,
          params.username,
          params.password
        );
        break;
      case "baidu-netdsik":
        fs = new BaiduFileSystem();
        break;
      case "onedrive":
        fs = new OneDriveFileSystem();
        break;
      case "googledrive":
        fs = new GoogleDriveFileSystem();
        break;
      default:
        throw new Error("not found filesystem");
    }
    return fs.verify().then(() => fs);
  }

  static params(): { [key: string]: FileSystemParams } {
    return {
      webdav: {
        authType: {
          title: t("auth_type"),
          type: "select",
          options: ["password", "digest", "none", "token"],
        },
        url: { title: t("url") },
        username: { title: t("username") },
        password: { title: t("password"), type: "password" },
      },
      "baidu-netdsik": {},
      onedrive: {},
      googledrive: {},
    };
  }

  static async mkdirAll(fs: FileSystem, path: string) {
    return new Promise<void>((resolve, reject) => {
      const dirs = path.split("/");
      let i = 0;
      const mkdir = () => {
        if (i >= dirs.length) {
          resolve();
          return;
        }
        const dir = dirs.slice(0, i + 1).join("/");
        fs.createDir(dir)
          .then(() => {
            i += 1;
            mkdir();
          })
          .catch(() => {
            reject();
          });
      };
      mkdir();
    });
  }
}
