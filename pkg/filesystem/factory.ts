import FileSystem from "./filesystem";
import WebDAVFileSystem from "./webdav/webdav";
import ZipFileSystem from "./zip/zip";

export type FileSystemType = "zip" | "webdav";

export type FileSystemParams = {
  [key: string]: {
    title: string;
    type?: "select";
    options?: string[];
  };
};

export default class FileSystemFactory {
  static create(type: FileSystemType, params: any): Promise<FileSystem> {
    switch (type) {
      case "zip":
        return Promise.resolve(new ZipFileSystem(params));
      case "webdav":
        return Promise.resolve(
          new WebDAVFileSystem(
            params.authType,
            params.url,
            params.username,
            params.password
          )
        );
      default:
        throw new Error("not found filesystem");
    }
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
    };
  }
}
