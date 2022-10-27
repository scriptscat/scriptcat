/* eslint-disable max-classes-per-file */
/* eslint-disable import/prefer-default-export */
import { WebDAVClient } from "webdav/web";
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
        return this.client.getFileContents(this.path, {
          format: "text",
        }) as Promise<string>;
      default: {
        const resp = (await this.client.getFileContents(this.path, {
          format: "binary",
        })) as ArrayBuffer;
        return Promise.resolve(new Blob([resp]));
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
    let resp;
    if (content instanceof Blob) {
      resp = await this.client.putFileContents(
        this.path,
        await content.arrayBuffer()
      );
    } else {
      resp = await this.client.putFileContents(this.path, content);
    }
    if (resp) {
      return Promise.resolve();
    }
    return Promise.reject(new Error("write error"));
  }
}
