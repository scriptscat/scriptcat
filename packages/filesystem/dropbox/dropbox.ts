import { AuthVerify } from "../auth";
import type FileSystem from "../filesystem";
import type { FileInfo, FileReader, FileWriter } from "../filesystem";
import { joinPath } from "../utils";
import { DropboxFileReader, DropboxFileWriter } from "./rw";

export default class DropboxFileSystem implements FileSystem {
  accessToken?: string;

  path: string;

  // 缓存路径到文件ID的映射，虽然Dropbox使用路径而不是ID，但可以用来优化请求
  private pathCache: Set<string> = new Set();

  constructor(path?: string, accessToken?: string) {
    // 因为 dropbox 授权后的路径就是/ScriptCat应用文件夹，删除 /ScriptCat 前缀
    this.path = (path || "").replace(/^\/ScriptCat/, "");
    this.accessToken = accessToken;
  }

  async verify(): Promise<void> {
    const token = await AuthVerify("dropbox");
    this.accessToken = token;
    return this.list().then();
  }

  open(file: FileInfo): Promise<FileReader> {
    return Promise.resolve(new DropboxFileReader(this, file));
  }

  openDir(path: string): Promise<FileSystem> {
    return Promise.resolve(new DropboxFileSystem(joinPath(this.path, path), this.accessToken));
  }

  create(path: string): Promise<FileWriter> {
    return Promise.resolve(new DropboxFileWriter(this, joinPath(this.path, path)));
  }

  async createDir(dir: string): Promise<void> {
    if (!dir) {
      return Promise.resolve();
    }

    const fullPath = joinPath(this.path, dir).replace(/^\/ScriptCat/, "");
    if (!fullPath) {
      return Promise.resolve();
    }

    // Dropbox 会自动创建父目录，所以我们只需要创建最终目录
    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/json");

    try {
      await this.request("https://api.dropboxapi.com/2/files/create_folder_v2", {
        method: "POST",
        headers: myHeaders,
        body: JSON.stringify({
          path: fullPath,
          autorename: false,
        }),
      });

      // 添加到缓存
      this.pathCache.add(fullPath);
    } catch (error: any) {
      // 如果目录已存在，Dropbox 会返回错误，但这是正常情况
      if (error.message && error.message.includes("path/conflict")) {
        // 目录已存在，不需要报错
        this.pathCache.add(fullPath);
        return;
      }
      throw error;
    }

    return Promise.resolve();
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
      .then(async (response) => {
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Dropbox API Error: ${response.status} - ${errorText}`);
        }
        return response.json();
      })
      .then(async (data) => {
        if (data.error) {
          if (data.error[".tag"] === "invalid_access_token") {
            // Token可能过期，尝试刷新
            const token = await AuthVerify("dropbox", true);
            this.accessToken = token;
            headers.set(`Authorization`, `Bearer ${this.accessToken}`);
            return fetch(url, config)
              .then(async (retryResponse) => {
                if (!retryResponse.ok) {
                  const errorText = await retryResponse.text();
                  throw new Error(`Dropbox API Error: ${retryResponse.status} - ${errorText}`);
                }
                return retryResponse.json();
              })
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

    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/json");

    await this.request("https://api.dropboxapi.com/2/files/delete_v2", {
      method: "POST",
      headers: myHeaders,
      body: JSON.stringify({
        path: fullPath,
      }),
    });

    // 清除相关缓存
    this.clearRelatedCache(fullPath);
  }

  async list(): Promise<FileInfo[]> {
    let folderPath = this.path;

    // Dropbox API 需要空字符串来表示根目录
    if (folderPath === "/" || folderPath === "") {
      folderPath = "";
    }

    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/json");

    let response = await this.request("https://api.dropboxapi.com/2/files/list_folder", {
      method: "POST",
      headers: myHeaders,
      body: JSON.stringify({
        path: folderPath,
      }),
    }).catch((e) => {
      if (e.message.includes("path/not_found")) {
        return { entries: [], has_more: false }; // 返回空数组以避免后续错误
      }
      throw e;
    });

    const list: FileInfo[] = [];

    const MAX_ITERATIONS = 100;
    let iterationCount = 0;

    while (true) {
      iterationCount++;
      if (iterationCount > MAX_ITERATIONS) {
        throw new Error("Dropbox list pagination exceeded maximum iterations");
      }
      if (response.entries) {
        for (const item of response.entries) {
          // 只包含文件，跳过文件夹
          if (item[".tag"] === "file") {
            list.push({
              name: item.name,
              path: this.path,
              size: item.size || 0,
              digest: item.content_hash || "",
              createtime: new Date(item.client_modified).getTime(),
              updatetime: new Date(item.server_modified).getTime(),
            });
          }
        }
      }

      // 检查是否有更多数据
      if (!response.has_more) {
        break;
      }

      // 获取下一页数据
      response = await this.request("https://api.dropboxapi.com/2/files/list_folder/continue", {
        method: "POST",
        headers: myHeaders,
        body: JSON.stringify({
          cursor: response.cursor,
        }),
      });
    }

    return list;
  }

  // 检查文件或文件夹是否存在
  async exists(path: string): Promise<boolean> {
    try {
      const myHeaders = new Headers();
      myHeaders.append("Content-Type", "application/json");

      await this.request("https://api.dropboxapi.com/2/files/get_metadata", {
        method: "POST",
        headers: myHeaders,
        body: JSON.stringify({
          path: path,
        }),
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  // 清除相关缓存
  clearRelatedCache(path: string): void {
    // 清除路径缓存
    const pathsToRemove = Array.from(this.pathCache).filter((p) => p.startsWith(path));
    pathsToRemove.forEach((p) => this.pathCache.delete(p));
  }

  async getDirUrl(): Promise<string> {
    throw new Error("Method not implemented.");
  }
}
