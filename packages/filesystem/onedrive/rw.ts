import type { FileCreateOptions, FileInfo, FileReader, FileWriter } from "../filesystem";
import { joinPath } from "../utils";
import type OneDriveFileSystem from "./onedrive";

export class OneDriveFileReader implements FileReader {
  file: FileInfo;

  fs: OneDriveFileSystem;

  constructor(fs: OneDriveFileSystem, file: FileInfo) {
    this.fs = fs;
    this.file = file;
  }

  async read(type?: "string" | "blob"): Promise<string | Blob> {
    const data = await this.fs.request(
      `https://graph.microsoft.com/v1.0/me/drive/special/approot:${joinPath(this.file.path, this.file.name)}:/content`,
      {},
      true
    );
    if (data.status !== 200) {
      throw new Error(await data.text());
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

export class OneDriveFileWriter implements FileWriter {
  path: string;

  fs: OneDriveFileSystem;

  opts?: FileCreateOptions;

  constructor(fs: OneDriveFileSystem, path: string, opts?: FileCreateOptions) {
    this.fs = fs;
    this.path = path;
    this.opts = opts;
  }

  size(content: string | Blob) {
    if (content instanceof Blob) {
      return content.size;
    }
    return new Blob([content]).size;
  }

  async write(content: string | Blob): Promise<void> {
    // 预上传获取id
    const size = this.size(content);
    if (size === 0) {
      const headers = this.createConditionalHeaders();
      return this.fs.request(`https://graph.microsoft.com/v1.0/me/drive/special/approot:${this.path}:/content`, {
        method: "PUT",
        body: content,
        ...(headers ? { headers } : {}),
      });
    }

    let myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/json");
    const conditionalHeaders = this.createConditionalHeaders(myHeaders);
    const uploadUrl = await this.fs
      .request(`https://graph.microsoft.com/v1.0/me/drive/special/approot:${this.path}:/createUploadSession`, {
        method: "POST",
        headers: conditionalHeaders,
        body: JSON.stringify({
          item: {
            "@microsoft.graph.conflictBehavior":
              this.opts?.createOnly || this.opts?.overwrite === false ? "fail" : "replace",
            // description: "description",
            // fileSystemInfo: {
            //   "@odata.type": "microsoft.graph.fileSystemInfo",
            // },
            // name: this.path.substring(this.path.lastIndexOf("/") + 1),
          },
        }),
      })
      .then((data) => {
        if (data.error) {
          throw new Error(JSON.stringify(data));
        }
        return data.uploadUrl;
      });
    myHeaders = new Headers();
    myHeaders.append("Content-Range", `bytes 0-${size - 1}/${size}`);
    return this.fs.request(uploadUrl, {
      method: "PUT",
      body: content,
      headers: myHeaders,
    });
  }

  private createConditionalHeaders(base?: Headers): Headers | undefined {
    const headers = base || new Headers();
    let hasCondition = false;
    if (this.opts?.createOnly || this.opts?.overwrite === false) {
      headers.set("If-None-Match", "*");
      hasCondition = true;
    } else {
      const expected = this.opts?.expectedVersion || this.opts?.expectedDigest;
      if (expected) {
        headers.set("If-Match", expected);
        hasCondition = true;
      }
    }
    return base || hasCondition ? headers : undefined;
  }
}
