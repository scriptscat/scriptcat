import type { WebDAVClient } from "webdav";
import type { FileCreateOptions, FileReader, FileWriter } from "../filesystem";
import { FileSystemError } from "../error";
import { createWebDAVFileSystemError } from "./error";

const quoteETag = (digest: string) => (digest.startsWith('"') && digest.endsWith('"') ? digest : `"${digest}"`);

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

  opts?: FileCreateOptions;

  constructor(client: WebDAVClient, path: string, opts?: FileCreateOptions) {
    this.client = client;
    this.path = path;
    this.opts = opts;
  }

  async write(content: string | Blob): Promise<void> {
    const data = content instanceof Blob ? await content.arrayBuffer() : content;
    let resp: boolean;
    try {
      const opts = this.buildWriteOptions();
      if (opts) {
        resp = await this.client.putFileContents(this.path, data, opts);
      } else {
        resp = await this.client.putFileContents(this.path, data);
      }
    } catch (error) {
      throw createWebDAVFileSystemError(error);
    }
    if (!resp) {
      if (this.opts?.createOnly) {
        throw new FileSystemError({
          provider: "webdav",
          message: "WebDAV create-only write conflict",
          status: 412,
          conflict: true,
        });
      }
      throw new Error("write error");
    }
  }

  private buildWriteOptions() {
    if (this.opts?.expectedDigest) {
      return {
        headers: {
          "If-Match": quoteETag(this.opts.expectedDigest),
        },
      };
    }
    if (this.opts?.createOnly) {
      return {
        overwrite: false,
      };
    }
    return undefined;
  }
}
