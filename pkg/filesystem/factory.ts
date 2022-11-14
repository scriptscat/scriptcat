import BaiduFileSystem from "./baidu/baidu";
import FileSystem from "./filesystem";
import WebDAVFileSystem from "./webdav/webdav";
import ZipFileSystem from "./zip/zip";

export type FileSystemType = "zip" | "webdav" | "baidu-netdsik";

export type FileSystemParams = {
  [key: string]: {
    title: string;
    type?: "select" | "authorize";
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
      default:
        throw new Error("not found filesystem");
    }
    return fs.verify().then(() => fs);
  }

  static params(): { [key: string]: FileSystemParams } {
    return {
      webdav: {
        authType: {
          title: "鉴权类型",
          type: "select",
          options: ["password", "digest", "none", "token"],
        },
        url: { title: "URL" },
        username: { title: "用户名" },
        password: { title: "密码" },
      },
      "baidu-netdsik": {},
    };
  }
}
