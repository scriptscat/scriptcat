import { FileSystemError } from "../error";
import type { FileInfo, FileReader, FileWriter } from "../filesystem";
import type { FileCreateOptions } from "../filesystem";
import { joinPath } from "../utils";
import type DropboxFileSystem from "./dropbox";

export class DropboxFileReader implements FileReader {
  file: FileInfo;

  fs: DropboxFileSystem;

  constructor(fs: DropboxFileSystem, file: FileInfo) {
    this.fs = fs;
    this.file = file;
  }

  async read(type?: "string" | "blob"): Promise<string | Blob> {
    const filePath = joinPath(this.file.path, this.file.name);

    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/octet-stream");
    myHeaders.append(
      "Dropbox-API-Arg",
      JSON.stringify({
        path: filePath,
      })
    );

    // 获取文件内容
    const data = await this.fs.request(
      "https://content.dropboxapi.com/2/files/download",
      {
        method: "POST",
        headers: myHeaders,
      },
      true
    );

    if (data.status !== 200) {
      return Promise.reject(await data.text());
    }

    switch (type) {
      case "string":
        return data.text();
      default: {
        return data.blob();
      }
    }
  }
}

export class DropboxFileWriter implements FileWriter {
  path: string;

  fs: DropboxFileSystem;

  opts?: FileCreateOptions;

  constructor(fs: DropboxFileSystem, path: string, opts?: FileCreateOptions) {
    this.fs = fs;
    this.path = path;
    this.opts = opts;
  }

  async write(content: string | Blob): Promise<void> {
    if (this.opts?.expectedDigest && !this.opts.expectedVersion) {
      throw new FileSystemError({
        provider: "dropbox",
        message: "Dropbox conditional writes require expectedVersion (rev), not expectedDigest",
        code: "unsupported_conditional_write",
        unsupported: true,
      });
    }
    if (this.opts?.createOnly || this.opts?.overwrite === false) {
      return this.createNewFile(content);
    }
    if (this.opts?.expectedVersion) {
      return this.updateFile(content, this.opts.expectedVersion);
    }

    // 检查文件是否存在
    const exists = await this.fs.exists(this.path);

    if (exists) {
      // 如果文件存在，则更新
      return this.updateFile(content);
    } else {
      // 如果文件不存在，则创建
      return this.createNewFile(content);
    }
  }

  private async updateFile(content: string | Blob, rev?: string): Promise<void> {
    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/octet-stream");
    myHeaders.append(
      "Dropbox-API-Arg",
      JSON.stringify({
        path: this.path,
        mode: rev ? { ".tag": "update", update: rev } : "overwrite",
        autorename: false,
      })
    );

    await this.upload(myHeaders, content);

    return Promise.resolve();
  }

  private async createNewFile(content: string | Blob): Promise<void> {
    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/octet-stream");
    myHeaders.append(
      "Dropbox-API-Arg",
      JSON.stringify({
        path: this.path,
        mode: "add",
        autorename: false,
      })
    );

    await this.upload(myHeaders, content);

    return Promise.resolve();
  }

  private async upload(headers: Headers, content: string | Blob): Promise<void> {
    try {
      await this.fs.request("https://content.dropboxapi.com/2/files/upload", {
        method: "POST",
        headers,
        body: content instanceof Blob ? content : new Blob([content]),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("409") || message.includes("conflict") || message.includes("incorrect_offset")) {
        throw new FileSystemError({
          provider: "dropbox",
          message,
          status: message.includes("409") ? 409 : undefined,
          conflict: true,
          raw: error,
        });
      }
      throw error;
    }
  }
}
