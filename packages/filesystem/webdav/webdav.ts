import type { AuthType, FileStat, WebDAVClient } from "webdav";
import { createClient } from "webdav";
import type FileSystem from "../filesystem";
import type { FileInfo, FileReader, FileWriter } from "../filesystem";
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
  }

  async open(file: FileInfo): Promise<FileReader> {
    return new WebDAVFileReader(this.client, joinPath(file.path, file.name));
  }

  async openDir(path: string): Promise<FileSystem> {
    return new WebDAVFileSystem(this.client, joinPath(this.basePath, path), this.url);
  }

  async create(path: string): Promise<FileWriter> {
    return new WebDAVFileWriter(this.client, joinPath(this.basePath, path));
  }

  async createDir(path: string): Promise<void> {
    try {
      await this.client.createDirectory(joinPath(this.basePath, path));
    } catch (e: any) {
      // 如果是405错误,则忽略
      if (e.message.includes("405")) {
        return;
      }
      throw e;
    }
  }

  async delete(path: string): Promise<void> {
    return this.client.deleteFile(joinPath(this.basePath, path));
  }

  async list(): Promise<FileInfo[]> {
    const dir = (await this.client.getDirectoryContents(this.basePath)) as FileStat[];
    const ret: FileInfo[] = [];
    for (const item of dir) {
      if (item.type !== "file") {
        continue;
      }
      const time = new Date(item.lastmod).getTime();
      ret.push({
        name: item.basename,
        path: this.basePath,
        digest: item.etag || "",
        size: item.size,
        createtime: time,
        updatetime: time,
      });
    }
    return ret;
  }

  async getDirUrl(): Promise<string> {
    return this.url + this.basePath;
  }
}
