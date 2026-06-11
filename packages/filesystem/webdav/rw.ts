import type { WebDAVClient } from "webdav";
import type { FileReader, FileWriter } from "../filesystem";
import { createWebDAVFileSystemError } from "./error";

export class WebDAVFileReader implements FileReader {
  client: WebDAVClient;

  path: string;

  constructor(client: WebDAVClient, path: string) {
    this.client = client;
    this.path = path;
  }

  async read(type?: "string" | "blob"): Promise<string | Blob> {
    try {
      switch (type) {
        case "string":
          return await (this.client.getFileContents(this.path, {
            format: "text",
          }) as Promise<string>);
        default: {
          const resp = (await this.client.getFileContents(this.path, {
            format: "binary",
          })) as ArrayBuffer;
          return new Blob([resp]);
        }
      }
    } catch (error) {
      throw createWebDAVFileSystemError(error);
    }
  }
}

export class WebDAVFileWriter implements FileWriter {
  client: WebDAVClient;

  path: string;

  constructor(client: WebDAVClient, path: string) {
    this.client = client;
    this.path = path;
  }

  async write(content: string | Blob): Promise<void> {
    const data = content instanceof Blob ? await content.arrayBuffer() : content;
    let resp: boolean;
    try {
      resp = await this.client.putFileContents(this.path, data);
    } catch (error) {
      throw createWebDAVFileSystemError(error);
    }
    if (!resp) {
      throw new Error("write error");
    }
  }
}
