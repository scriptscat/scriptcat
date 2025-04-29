import { AuthType, createClient, FileStat, WebDAVClient } from "webdav";
import FileSystem, { File, FileReader, FileWriter } from "../filesystem";
import { joinPath } from "../utils";
import { WebDAVFileReader, WebDAVFileWriter } from "./rw";
import { WarpTokenError } from "../error";

export default class WebDAVFileSystem implements FileSystem {
  client: WebDAVClient;

  url: string;

  basePath: string = "/";

  constructor(authType: AuthType | WebDAVClient, url?: string, username?: string, password?: string) {
    if (typeof authType === "object") {
      this.client = authType;
      this.basePath = joinPath(url || "");
      this.url = username!;
    } else {
      this.url = url!;
      this.client = createClient(url!, {
        authType,
        username,
        password,
      });
    }
  }

  async verify(): Promise<void> {
    try {
      await this.client.getQuota();
    } catch (e: any) {
      if (e.response && e.response.status === 401) {
        throw new WarpTokenError(e);
      }
      throw new Error("verify failed");
    }
    return Promise.resolve();
  }

  open(file: File): Promise<FileReader> {
    return Promise.resolve(new WebDAVFileReader(this.client, joinPath(file.path, file.name)));
  }

  openDir(path: string): Promise<FileSystem> {
    return Promise.resolve(new WebDAVFileSystem(this.client, joinPath(this.basePath, path), this.url));
  }

  create(path: string): Promise<FileWriter> {
    return Promise.resolve(new WebDAVFileWriter(this.client, joinPath(this.basePath, path)));
  }

  async createDir(path: string): Promise<void> {
    try {
      return Promise.resolve(await this.client.createDirectory(joinPath(this.basePath, path)));
    } catch (e: any) {
      // 如果是405错误,则忽略
      if (e.message.includes("405")) {
        return Promise.resolve();
      }
      return Promise.reject(e);
    }
  }

  async delete(path: string): Promise<void> {
    return this.client.deleteFile(joinPath(this.basePath, path));
  }

  async list(): Promise<File[]> {
    const dir = (await this.client.getDirectoryContents(this.basePath)) as FileStat[];
    const ret: File[] = [];
    dir.forEach((item: FileStat) => {
      if (item.type !== "file") {
        return;
      }
      ret.push({
        name: item.basename,
        path: this.basePath,
        digest: item.etag || "",
        size: item.size,
        createtime: new Date(item.lastmod).getTime(),
        updatetime: new Date(item.lastmod).getTime(),
      });
    });
    return Promise.resolve(ret);
  }

  getDirUrl(): Promise<string> {
    return Promise.resolve(this.url + this.basePath);
  }
}
