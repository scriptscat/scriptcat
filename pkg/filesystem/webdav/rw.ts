/* eslint-disable max-classes-per-file */
/* eslint-disable import/prefer-default-export */
import type { WebDAVClient } from "webdav";
import { FileReader, FileWriter } from "../filesystem";

export class WebDAVFileReader implements FileReader {
  client: WebDAVClient;

  path: string;

  constructor(client: WebDAVClient, path: string) {
    this.client = client;
    this.path = path;
  }

  async read(type?: "string" | "blob"): Promise<string | Blob> {
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
    const resp = await this.client.putFileContents(this.path, data);
    if (!resp) {
      throw new Error("write error");
    }
  }
}
