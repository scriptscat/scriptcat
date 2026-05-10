import type { WebDAVClient } from "webdav";
import { FileSystemError } from "../error";
import type { FileCreateOptions, FileReader, FileWriter } from "../filesystem";

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

  opts?: FileCreateOptions;

  constructor(client: WebDAVClient, path: string, opts?: FileCreateOptions) {
    this.client = client;
    this.path = path;
    this.opts = opts;
  }

  async write(content: string | Blob): Promise<void> {
    const data = content instanceof Blob ? await content.arrayBuffer() : content;
    const headers: Record<string, string> = {};
    const expected = this.opts?.expectedVersion || this.opts?.expectedDigest;
    if (expected && !this.opts?.createOnly && this.opts?.overwrite !== false) {
      headers["If-Match"] = expected;
    }
    const options = {
      ...(Object.keys(headers).length ? { headers } : {}),
      ...(this.opts?.createOnly || this.opts?.overwrite === false ? { overwrite: false } : {}),
    };
    let resp;
    try {
      resp = await this.client.putFileContents(this.path, data, options);
    } catch (error: any) {
      if (error.response?.status === 409 || error.response?.status === 412) {
        throw new FileSystemError({
          provider: "webdav",
          message: error.message || "WebDAV conditional write failed",
          status: error.response.status,
          conflict: true,
          raw: error,
        });
      }
      throw error;
    }
    if (!resp) {
      throw new Error("write error");
    }
  }
}
