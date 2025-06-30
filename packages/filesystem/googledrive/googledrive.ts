import { AuthVerify } from "../auth";
import FileSystem, { File, FileReader, FileWriter } from "../filesystem";
import { joinPath } from "../utils";
import { GoogleDriveFileReader, GoogleDriveFileWriter } from "./rw";

export default class GoogleDriveFileSystem implements FileSystem {
  accessToken?: string;

  path: string;

  constructor(path?: string, accessToken?: string) {
    this.path = path || "/";
    this.accessToken = accessToken;
  }

  async verify(): Promise<void> {
    const token = await AuthVerify("googledrive");
    this.accessToken = token;
    return this.list().then();
  }

  open(file: File): Promise<FileReader> {
    return Promise.resolve(new GoogleDriveFileReader(this, file));
  }

  openDir(path: string): Promise<FileSystem> {
    if (path.startsWith("ScriptCat")) {
      path = path.substring(9);
    }
    return Promise.resolve(new GoogleDriveFileSystem(joinPath(this.path, path), this.accessToken));
  }

  create(path: string): Promise<FileWriter> {
    return Promise.resolve(new GoogleDriveFileWriter(this, joinPath(this.path, path)));
  }

  async createDir(dir: string): Promise<void> {
    if (dir && dir.startsWith("ScriptCat")) {
      dir = dir.substring(9);
      if (dir.startsWith("/")) {
        dir = dir.substring(1);
      }
    }
    if (!dir) {
      return Promise.resolve();
    }
    const fullPath = joinPath(this.path, dir);
    const dirs = fullPath.split("/").filter(Boolean);
    
    // 查找应用程序目录或创建根目录
    let parentId = "root";
    let currentPath = "";
    
    // 检查ScriptCat应用目录是否存在
    const appFolderName = "ScriptCat";
    let appFolder = await this.findFolderByName(appFolderName, parentId);
    if (!appFolder) {
      appFolder = await this.createFolder(appFolderName, parentId);
    }
    parentId = appFolder.id;
    currentPath = "/ScriptCat";

    // 逐级创建目录
    for (const dirName of dirs) {
      currentPath = joinPath(currentPath, dirName);
      
      // 查找目录是否已存在
      let folder = await this.findFolderByName(dirName, parentId);
      if (!folder) {
        // 不存在则创建
        folder = await this.createFolder(dirName, parentId);
      }
      parentId = folder.id;
    }
    
    return Promise.resolve();
  }

  async findFolderByName(name: string, parentId: string): Promise<{ id: string; name: string } | null> {
    const query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
    const response = await this.request(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`
    );
    
    if (response.files && response.files.length > 0) {
      return response.files[0];
    }
    return null;
  }

  async createFolder(name: string, parentId: string): Promise<{ id: string; name: string }> {
    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/json");
    
    const response = await this.request("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: myHeaders,
      body: JSON.stringify({
        name: name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId]
      }),
    });
    
    if (response.error) {
      throw new Error(JSON.stringify(response));
    }
    
    return {
      id: response.id,
      name: response.name
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
    // 首先，找到要删除的文件或文件夹
    const fileId = await this.getFileId(joinPath(this.path, path));
    if (!fileId) {
      throw new Error(`File or directory not found: ${path}`);
    }
    
    // 删除文件或文件夹
    return this.request(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      {
        method: "DELETE",
      },
      true
    ).then(async (resp) => {
      if (resp.status !== 204 && resp.status !== 200) {
        throw new Error(await resp.text());
      }
    });
  }

  async getFileId(path: string): Promise<string | null> {
    if (path === "/" || path === "") {
      return "root";
    }
    
    // 从根目录开始逐级查找
    const pathParts = path.split("/").filter(Boolean);
    let parentId = "root";
    
    // 检查是否包含ScriptCat根目录
    if (pathParts[0] !== "ScriptCat") {
      // 如果没有ScriptCat前缀，先查找ScriptCat目录
      const appFolder = await this.findFolderByName("ScriptCat", parentId);
      if (!appFolder) {
        return null;
      }
      parentId = appFolder.id;
    } else {
      // 如果有ScriptCat前缀，移除它并从ScriptCat目录开始查找
      const appFolder = await this.findFolderByName("ScriptCat", parentId);
      if (!appFolder) {
        return null;
      }
      parentId = appFolder.id;
      pathParts.shift(); // 移除ScriptCat
    }
    
    // 逐级查找路径
    let currentId = parentId;
    for (const part of pathParts) {
      const query = `name='${part}' and '${currentId}' in parents and trashed=false`;
      const response = await this.request(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`
      );
      
      if (!response.files || response.files.length === 0) {
        return null;
      }
      
      currentId = response.files[0].id;
    }
    
    return currentId;
  }

  async list(): Promise<File[]> {
    let folderId = "root";
    
    // 获取当前目录的ID
    if (this.path !== "/") {
      const foundId = await this.getFileId(this.path);
      if (!foundId) {
        throw new Error(`Directory not found: ${this.path}`);
      }
      folderId = foundId;
    }
    
    // 列出目录内容
    const query = `'${folderId}' in parents and trashed=false`;
    const response = await this.request(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,md5Checksum,createdTime,modifiedTime)`
    );
    
    const list: File[] = [];
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
    
    return list;
  }

  getDirUrl(): Promise<string> {
    throw new Error("Method not implemented.");
  }
}
