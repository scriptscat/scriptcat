import { FileSystemError, isNotFoundError } from "../error";
import type { FileCreateOptions, FileInfo, FileReader, FileWriter } from "../filesystem";
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

  opts?: FileCreateOptions;

  constructor(fs: GoogleDriveFileSystem, path: string, opts?: FileCreateOptions) {
    this.fs = fs;
    this.path = path;
    this.opts = opts;
  }

  async write(content: string | Blob): Promise<void> {
    try {
      return await this.writeWithResolvedParent(content);
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
      this.fs.clearPathCache();
      return await this.writeWithResolvedParent(content);
    }
  }

  private async writeWithResolvedParent(content: string | Blob): Promise<void> {
    if (this.opts?.createOnly || this.opts?.overwrite === false) {
      throw new FileSystemError({
        provider: "googledrive",
        message: "Google Drive does not enforce unique file names for atomic createOnly writes",
        code: "unsupported_atomic_create",
        unsupported: true,
      });
    }

    // 解析文件路径和文件名
    const pathParts = this.path.split("/").filter(Boolean);
    const fileName = pathParts.pop() || ""; // 获取文件名
    const dirPath = "/" + pathParts.join("/"); // 重建目录路径

    // 使用优化的方法确保目录存在并获取ID
    const parentId = await this.fs.ensureDirExists(dirPath);

    // 使用优化的查找方法
    const expected = parseGoogleDriveVersion(this.opts?.expectedVersion);
    const existingFileId = expected?.fileId || (await this.fs.findFileInDirectory(fileName, parentId));

    if (existingFileId) {
      // 如果文件存在，则更新
      return this.updateFile(existingFileId, content, expected?.matchToken || this.opts?.expectedDigest);
    } else {
      // 如果文件不存在，则创建
      return this.createNewFile(fileName, parentId, content);
    }
  }

  private async updateFile(fileId: string, content: string | Blob, expected?: string): Promise<void> {
    // 不设置Content-Type，让浏览器自动处理multipart/form-data边界

    const metadata = {
      // 只更新内容，不更新元数据
    };

    const formData = new FormData();
    formData.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    formData.append("file", content instanceof Blob ? content : new Blob([content]));

    const headers = expected ? new Headers({ "If-Match": expected }) : undefined;

    await this.fs.request(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&spaces=appDataFolder`,
      {
        method: "PATCH",
        body: formData,
        ...(headers ? { headers } : {}),
      }
    );

    return Promise.resolve();
  }

  private async createNewFile(fileName: string, parentId: string, content: string | Blob): Promise<void> {
    // 不设置Content-Type，让浏览器自动处理multipart/form-data边界

    const createOnly = this.opts?.createOnly || this.opts?.overwrite === false;
    const generatedId = createOnly ? await this.fs.generateFileId() : undefined;
    const metadata = {
      ...(generatedId ? { id: generatedId } : {}),
      name: fileName,
      parents: [parentId],
    };

    const formData = new FormData();
    formData.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    formData.append("file", content instanceof Blob ? content : new Blob([content]));

    const headers = createOnly ? new Headers({ "If-None-Match": "*" }) : undefined;

    const created = await this.fs.request(
      `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&spaces=appDataFolder&fields=id`,
      {
        method: "POST",
        body: formData,
        ...(headers ? { headers } : {}),
      }
    );

    if (createOnly) {
      await this.rejectDuplicateCreate(fileName, parentId, created?.id);
    }

    return Promise.resolve();
  }

  private async rejectDuplicateCreate(fileName: string, parentId: string, createdId?: string): Promise<void> {
    if (!createdId) {
      return;
    }
    const files = await this.fs.findFilesInDirectory(fileName, parentId);
    if (!files.length || (files.length === 1 && files[0].id === createdId)) {
      return;
    }
    try {
      await this.fs.request(`https://www.googleapis.com/drive/v3/files/${createdId}?spaces=appDataFolder`, {
        method: "DELETE",
      });
    } catch {
      // Best-effort cleanup. The conflict still prevents local digest/status from being advanced.
    }
    throw new FileSystemError({
      provider: "googledrive",
      message: `Duplicate Google Drive file detected after create: ${this.path}`,
      status: 409,
      code: "nameAlreadyExists",
      conflict: true,
    });
  }
}

function parseGoogleDriveVersion(version?: string): { fileId: string; matchToken?: string } | undefined {
  if (!version) return undefined;
  const index = version.indexOf(":");
  if (index === -1) {
    return { fileId: version };
  }
  return {
    fileId: version.substring(0, index),
    matchToken: version.substring(index + 1) || undefined,
  };
}
