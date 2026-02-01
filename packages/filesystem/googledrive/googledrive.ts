import { AuthVerify } from "../auth";
import type FileSystem from "../filesystem";
import type { FileInfo, FileReader, FileWriter } from "../filesystem";
import { joinPath } from "../utils";
import { GoogleDriveFileReader, GoogleDriveFileWriter } from "./rw";

export default class GoogleDriveFileSystem implements FileSystem {
  accessToken?: string;

  path: string;

  // 缓存路径到文件ID的映射
  private pathToIdCache: Map<string, string> = new Map();

  constructor(path?: string, accessToken?: string) {
    this.path = path || "/";
    this.accessToken = accessToken;
  }

  async verify(): Promise<void> {
    const token = await AuthVerify("googledrive");
    this.accessToken = token;
    return this.list().then();
  }

  open(file: FileInfo): Promise<FileReader> {
    return Promise.resolve(new GoogleDriveFileReader(this, file));
  }

  openDir(path: string): Promise<FileSystem> {
    return Promise.resolve(new GoogleDriveFileSystem(joinPath(this.path, path), this.accessToken));
  }

  create(path: string): Promise<FileWriter> {
    return Promise.resolve(new GoogleDriveFileWriter(this, joinPath(this.path, path)));
  }
  async createDir(dir: string): Promise<void> {
    if (!dir) {
      return Promise.resolve();
    }

    const fullPath = joinPath(this.path, dir);
    const dirs = fullPath.split("/").filter(Boolean);

    // 从根目录开始逐级创建目录
    let parentId = "appDataFolder";
    let currentPath = "";

    // 逐级创建目录，使用缓存减少重复请求
    for (const dirName of dirs) {
      currentPath = joinPath(currentPath, dirName);

      // 先检查缓存
      let folderId = this.pathToIdCache.get(currentPath);

      if (!folderId) {
        // 缓存中没有，查找目录是否已存在
        let folder = await this.findFolderByName(dirName, parentId);
        if (!folder) {
          // 不存在则创建
          folder = await this.createFolder(dirName, parentId);
        }
        folderId = folder.id;

        // 更新缓存
        this.pathToIdCache.set(currentPath, folderId);
      }

      parentId = folderId;
    }

    return Promise.resolve();
  }
  async findFolderByName(name: string, parentId: string): Promise<{ id: string; name: string } | null> {
    const query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
    const response = await this.request(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&spaces=appDataFolder`
    );

    if (response.files && response.files.length > 0) {
      return response.files[0];
    }
    return null;
  }

  async createFolder(name: string, parentId: string): Promise<{ id: string; name: string }> {
    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/json");

    const response = await this.request("https://www.googleapis.com/drive/v3/files?spaces=appDataFolder", {
      method: "POST",
      headers: myHeaders,
      body: JSON.stringify({
        name: name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      }),
    });

    if (response.error) {
      throw new Error(JSON.stringify(response));
    }

    return {
      id: response.id,
      name: response.name,
    };
  }

  request(url: string, config?: RequestInit, nothen?: boolean) {
    config = config || {};
    const headers = <Headers>config.headers || new Headers();
    headers.append(`Authorization`, `Bearer ${this.accessToken}`);
    config.headers = headers;
    const ret = fetch(url, config);
    if (nothen) {
      return <Promise<Response>>ret;
    }
    return ret
      .then((data) => data.json())
      .then(async (data) => {
        if (data.error) {
          if (data.error.code === 401) {
            // Token可能过期，尝试刷新
            const token = await AuthVerify("googledrive", true);
            this.accessToken = token;
            headers.set(`Authorization`, `Bearer ${this.accessToken}`);
            return fetch(url, config)
              .then((retryData) => retryData.json())
              .then((retryData) => {
                if (retryData.error) {
                  throw new Error(JSON.stringify(retryData));
                }
                return retryData;
              });
          }
          throw new Error(JSON.stringify(data));
        }
        return data;
      });
  }
  async delete(path: string): Promise<void> {
    const fullPath = joinPath(this.path, path);

    // 首先，找到要删除的文件或文件夹
    const fileId = await this.getFileId(fullPath);
    if (!fileId) {
      throw new Error(`File or directory not found: ${fullPath}`);
    }

    // 删除文件或文件夹
    await this.request(
      `https://www.googleapis.com/drive/v3/files/${fileId}?spaces=appDataFolder`,
      {
        method: "DELETE",
      },
      true
    ).then(async (resp) => {
      if (resp.status !== 204 && resp.status !== 200) {
        throw new Error(await resp.text());
      }
    });

    // 清除相关缓存
    this.clearRelatedCache(fullPath);
  }
  async getFileId(path: string): Promise<string | null> {
    if (path === "/" || path === "") {
      return "appDataFolder";
    }

    // 先检查缓存
    const cachedId = this.pathToIdCache.get(path);
    if (cachedId) {
      return cachedId;
    }

    // 从根目录开始逐级查找
    const pathParts = path.split("/").filter(Boolean);
    let parentId = "appDataFolder";
    let currentPath = "";

    // 逐级查找路径
    for (const part of pathParts) {
      currentPath = joinPath(currentPath, part);

      // 检查这个路径是否已经缓存
      const cachedPartId = this.pathToIdCache.get(currentPath);
      if (cachedPartId) {
        parentId = cachedPartId;
        continue;
      }

      const query = `name='${part}' and '${parentId}' in parents and trashed=false`;
      const response = await this.request(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&spaces=appDataFolder`
      );

      if (!response.files || response.files.length === 0) {
        return null;
      }

      parentId = response.files[0].id;

      // 缓存这个路径的ID
      this.pathToIdCache.set(currentPath, parentId);
    }

    return parentId;
  }
  async list(): Promise<FileInfo[]> {
    let folderId = "appDataFolder";

    // 获取当前目录的ID
    if (this.path !== "/") {
      const foundId = await this.getFileId(this.path);
      if (!foundId) {
        throw new Error(`Directory not found: ${this.path}`);
      }
      folderId = foundId;
    }

    // 列出目录内容，处理分页
    const list: FileInfo[] = [];
    let pageToken: string | undefined = undefined;

    const query = `'${folderId}' in parents and trashed=false`;
    const MAX_ITERATIONS = 100;
    let iterations = 0;

    while (true) {
      iterations += 1;
      if (iterations > MAX_ITERATIONS) {
        throw new Error("GoogleDrive list pagination exceeded maximum iterations");
      }
      const url = new URL("https://www.googleapis.com/drive/v3/files");
      url.searchParams.set("q", query);
      url.searchParams.set("fields", "files(id,name,mimeType,size,md5Checksum,createdTime,modifiedTime),nextPageToken");
      url.searchParams.set("spaces", "appDataFolder");
      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      const response = await this.request(url.toString());

      if (response.files) {
        for (const item of response.files) {
          list.push({
            name: item.name,
            path: this.path,
            size: item.size ? parseInt(item.size, 10) : 0,
            digest: item.md5Checksum || "",
            createtime: new Date(item.createdTime).getTime(),
            updatetime: new Date(item.modifiedTime).getTime(),
          });
        }
      }

      pageToken = response.nextPageToken;
      if (!pageToken) {
        break;
      }
    }

    return list;
  }

  // 辅助方法：在指定目录中查找文件
  async findFileInDirectory(fileName: string, parentId: string): Promise<string | null> {
    const query = `name='${fileName}' and '${parentId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`;
    const response = await this.request(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&spaces=appDataFolder`
    );

    if (response.files && response.files.length > 0) {
      return response.files[0].id;
    }
    return null;
  }

  // 清除相关缓存
  clearRelatedCache(path: string): void {
    // 清除路径缓存
    const pathsToRemove = Array.from(this.pathToIdCache.keys()).filter((p) => p.startsWith(path));
    pathsToRemove.forEach((p) => this.pathToIdCache.delete(p));
  }

  async getDirUrl(): Promise<string> {
    throw new Error("Method not implemented.");
  }

  // 确保目录存在并返回目录ID，优化Writer避免重复获取
  async ensureDirExists(dirPath: string): Promise<string> {
    if (dirPath === "/" || dirPath === "") {
      return "appDataFolder";
    }

    // 先检查缓存
    const cachedId = this.pathToIdCache.get(dirPath);
    if (cachedId) {
      return cachedId;
    }

    // 如果没有缓存，使用getFileId方法
    const foundId = await this.getFileId(dirPath);
    if (!foundId) {
      throw new Error(`Failed to create or find directory: ${dirPath}`);
    }

    // 缓存结果
    this.pathToIdCache.set(dirPath, foundId);
    return foundId;
  }
}
