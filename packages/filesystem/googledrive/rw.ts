import type { FileInfo, FileReader, FileWriter } from "../filesystem";
import { joinPath } from "../utils";
import type GoogleDriveFileSystem from "./googledrive";

export class GoogleDriveFileReader implements FileReader {
  file: FileInfo;

  fs: GoogleDriveFileSystem;

  constructor(fs: GoogleDriveFileSystem, file: FileInfo) {
    this.fs = fs;
    this.file = file;
  }

  async read(type?: "string" | "blob"): Promise<string | Blob> {
    // 首先获取文件ID
    const fileId = await this.fs.getFileId(joinPath(this.file.path, this.file.name));
    if (!fileId) {
      return Promise.reject(new Error(`File not found: ${this.file.name}`));
    }

    // 获取文件内容
    const data = await this.fs.request(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&spaces=appDataFolder`,
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

export class GoogleDriveFileWriter implements FileWriter {
  path: string;

  fs: GoogleDriveFileSystem;

  constructor(fs: GoogleDriveFileSystem, path: string) {
    this.fs = fs;
    this.path = path;
  }

  async write(content: string | Blob): Promise<void> {
    // 解析文件路径和文件名
    const pathParts = this.path.split("/").filter(Boolean);
    const fileName = pathParts.pop() || ""; // 获取文件名
    const dirPath = "/" + pathParts.join("/"); // 重建目录路径

    // 使用优化的方法确保目录存在并获取ID
    const parentId = await this.fs.ensureDirExists(dirPath);

    // 使用优化的查找方法
    const existingFileId = await this.fs.findFileInDirectory(fileName, parentId);

    if (existingFileId) {
      // 如果文件存在，则更新
      return this.updateFile(existingFileId, content);
    } else {
      // 如果文件不存在，则创建
      return this.createNewFile(fileName, parentId, content);
    }
  }

  private async updateFile(fileId: string, content: string | Blob): Promise<void> {
    // 不设置Content-Type，让浏览器自动处理multipart/form-data边界

    const metadata = {
      // 只更新内容，不更新元数据
    };

    const formData = new FormData();
    formData.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    formData.append("file", content instanceof Blob ? content : new Blob([content]));

    await this.fs.request(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&spaces=appDataFolder`,
      {
        method: "PATCH",
        body: formData,
      }
    );

    return Promise.resolve();
  }

  private async createNewFile(fileName: string, parentId: string, content: string | Blob): Promise<void> {
    // 不设置Content-Type，让浏览器自动处理multipart/form-data边界

    const metadata = {
      name: fileName,
      parents: [parentId],
    };

    const formData = new FormData();
    formData.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    formData.append("file", content instanceof Blob ? content : new Blob([content]));

    await this.fs.request(
      `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&spaces=appDataFolder`,
      {
        method: "POST",
        body: formData,
      }
    );

    return Promise.resolve();
  }
}
