import { calculateMd5 } from "@App/pkg/utils/utils";
import { MD5 } from "crypto-js";
import { File, FileReader, FileWriter } from "../filesystem";
import { joinPath } from "../utils";
import OneDriveFileSystem from "./onedrive";

export class OneDriveFileReader implements FileReader {
  file: File;

  fs: OneDriveFileSystem;

  constructor(fs: OneDriveFileSystem, file: File) {
    this.fs = fs;
    this.file = file;
  }

  async read(type?: "string" | "blob"): Promise<string | Blob> {
    const data = await this.fs.request(
      `https://graph.microsoft.com/v1.0/me/drive/special/approot:${joinPath(
        this.file.path,
        this.file.name
      )}:/content`,
      {},
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

export class OneDriveFileWriter implements FileWriter {
  path: string;

  fs: OneDriveFileSystem;

  constructor(fs: OneDriveFileSystem, path: string) {
    this.fs = fs;
    this.path = path;
  }

  size(content: string | Blob) {
    if (content instanceof Blob) {
      return content.size;
    }
    return new Blob([content]).size;
  }

  async md5(content: string | Blob) {
    if (content instanceof Blob) {
      return calculateMd5(content);
    }
    return MD5(content).toString();
  }

  async write(content: string | Blob): Promise<void> {
    // 预上传获取id
    const size = this.size(content).toString();
    let myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/json");
    const uploadUrl = await this.fs
      .request(
        `https://graph.microsoft.com/v1.0/me/drive/special/approot:${this.path}:/createUploadSession`,
        {
          method: "POST",
          headers: myHeaders,
          body: JSON.stringify({
            item: {
              "@microsoft.graph.conflictBehavior": "replace",
              // description: "description",
              // fileSystemInfo: {
              //   "@odata.type": "microsoft.graph.fileSystemInfo",
              // },
              // name: this.path.substring(this.path.lastIndexOf("/") + 1),
            },
          }),
        }
      )
      .then((data) => {
        if (data.error) {
          throw new Error(JSON.stringify(data));
        }
        return data.uploadUrl;
      });
    myHeaders = new Headers();
    myHeaders.append(
      "Content-Range",
      `bytes 0-${parseInt(size, 10) - 1}/${size}`
    );
    return this.fs.request(uploadUrl, {
      method: "PUT",
      body: content,
      headers: myHeaders,
    });
  }
}
