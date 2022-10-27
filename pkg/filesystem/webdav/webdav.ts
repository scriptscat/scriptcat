import { AuthType, createClient, FileStat, WebDAVClient } from "webdav/web";
import FileSystem, { File, FileReader, FileWriter } from "../filesystem";
import { WebDAVFileReader, WebDAVFileWriter } from "./rw";

export default class WebDAVFileSystem implements FileSystem {
  client: WebDAVClient;

  constructor(
    authType: AuthType,
    url: string,
    username: string,
    password: string
  ) {
    this.client = createClient(url, {
      authType,
      username,
      password,
    });
  }

  open(path: string): Promise<FileReader> {
    return Promise.resolve(new WebDAVFileReader(this.client, path));
  }

  create(path: string): Promise<FileWriter> {
    return Promise.resolve(new WebDAVFileWriter(this.client, path));
  }

  async delete(path: string): Promise<void> {
    return this.client.deleteFile(path);
  }

  async list(path?: string | undefined): Promise<File[]> {
    const dir = (await this.client.getDirectoryContents(
      path || ""
    )) as FileStat[];
    const ret: File[] = [];
    dir.forEach((item: FileStat) => {
      if (item.type !== "file" || !item.basename.endsWith(".zip")) {
        return;
      }
      ret.push({
        name: item.basename,
        path: item.filename.substring(
          0,
          item.filename.length - item.basename.length
        ),
        size: item.size,
        createtime: new Date(item.lastmod).getTime(),
        updatetime: new Date(item.lastmod).getTime(),
      });
    });
    return Promise.resolve(ret);
  }
}
