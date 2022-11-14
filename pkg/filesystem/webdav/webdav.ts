import { AuthType, createClient, FileStat, WebDAVClient } from "webdav/web";
import FileSystem, { File, FileReader, FileWriter } from "../filesystem";
import { WebDAVFileReader, WebDAVFileWriter } from "./rw";

export default class WebDAVFileSystem implements FileSystem {
  client: WebDAVClient;

  basePath: string = "";

  constructor(
    authType: AuthType | WebDAVClient,
    url?: string,
    username?: string,
    password?: string
  ) {
    if (typeof authType === "object") {
      this.client = authType;
      this.basePath = url || "";
    } else {
      this.client = createClient(url!, {
        authType,
        username,
        password,
      });
    }
  }

  async verify(): Promise<void> {
    await this.client.getQuota();
    return Promise.resolve();
  }

  open(file: File): Promise<FileReader> {
    const path = file.name;
    return Promise.resolve(
      new WebDAVFileReader(this.client, this.getPath(path))
    );
  }

  openDir(path: string): Promise<FileSystem> {
    if (!path.endsWith("/")) {
      path += "/";
    }
    return Promise.resolve(new WebDAVFileSystem(this.client, path));
  }

  create(path: string): Promise<FileWriter> {
    return Promise.resolve(
      new WebDAVFileWriter(this.client, this.getPath(path))
    );
  }

  createDir(path: string): Promise<void> {
    return this.client.createDirectory(this.getPath(path));
  }

  async delete(path: string): Promise<void> {
    return this.client.deleteFile(this.getPath(path));
  }

  getPath(path: string): string {
    return this.basePath + path;
  }

  async list(path?: string | undefined): Promise<File[]> {
    const dir = (await this.client.getDirectoryContents(
      this.getPath(path || "")
    )) as FileStat[];
    const ret: File[] = [];
    dir.forEach((item: FileStat) => {
      if (item.type !== "file") {
        return;
      }
      ret.push({
        name: item.basename,
        path: item.filename.substring(
          0,
          item.filename.length - item.basename.length
        ),
        digest: item.etag || "",
        size: item.size,
        createtime: new Date(item.lastmod).getTime(),
        updatetime: new Date(item.lastmod).getTime(),
      });
    });
    return Promise.resolve(ret);
  }
}
