import i18next from "i18next";
import BaiduFileSystem from "./baidu/baidu";
import FileSystem from "./filesystem";
import OneDriveFileSystem from "./onedrive/onedrive";
import WebDAVFileSystem from "./webdav/webdav";
import ZipFileSystem from "./zip/zip";

export type FileSystemType = "zip" | "webdav" | "baidu-netdsik" | "onedrive";

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
      default:
        throw new Error("not found filesystem");
    }
    return fs.verify().then(() => fs);
  }

  static params(): { [key: string]: FileSystemParams } {
    return {
      webdav: {
        authType: {
          title: i18next.t("auth_type"),
          type: "select",
          options: ["password", "digest", "none", "token"],
        },
        url: { title: i18next.t("url") },
        username: { title: i18next.t("username") },
        password: { title: i18next.t("password"), type: "password" },
      },
      "baidu-netdsik": {},
      onedrive: {},
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
