import { AuthVerify } from "../auth";
import { FileSystemError, fileConflictError, isNotFoundError } from "../error";
import type FileSystem from "../filesystem";
import type { FileInfo, FileCreateOptions, FileDeleteOptions, FileReader, FileWriter } from "../filesystem";
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

  create(path: string, opts?: FileCreateOptions): Promise<FileWriter> {
    return Promise.resolve(new GoogleDriveFileWriter(this, joinPath(this.path, path), opts));
  }
  async createDir(dir: string, _opts?: FileCreateOptions): Promise<void> {
    if (!dir) {
      return Promise.resolve();
    }

    const fullPath = joinPath(this.path, dir);
    await this.ensureDirPath(fullPath);
  }

  private async ensureDirPath(fullPath: string): Promise<string> {
    if (fullPath === "/" || fullPath === "") {
      return "appDataFolder";
    }

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

    return parentId;
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

  private createRequestError(raw: unknown, status?: number): FileSystemError {
    const errorBody =
      raw && typeof raw === "object" && "error" in raw ? (raw as { error?: Record<string, unknown> }).error : undefined;
    const googleStatus = typeof errorBody?.code === "number" ? errorBody.code : status;
    const code =
      typeof errorBody?.status === "string"
        ? errorBody.status
        : typeof errorBody?.code === "number"
          ? String(errorBody.code)
          : undefined;
    const message =
      typeof errorBody?.message === "string"
        ? errorBody.message
        : typeof raw === "string" && raw
          ? raw
          : `Google Drive request failed${googleStatus ? ` with status ${googleStatus}` : ""}`;

    return new FileSystemError({
      provider: "googledrive",
      message,
      status: googleStatus,
      code,
      auth: googleStatus === 401,
      notFound: googleStatus === 404,
      conflict: googleStatus === 409 || googleStatus === 412,
      rateLimit: googleStatus === 429,
      retryable: googleStatus === 429 || (googleStatus !== undefined && googleStatus >= 500),
      raw,
    });
  }

  private async createResponseError(resp: Response): Promise<FileSystemError> {
    const text = await resp.text();
    let raw;
    try {
      raw = text ? JSON.parse(text) : "";
    } catch {
      raw = text;
    }
    return this.createRequestError(raw, resp.status);
  }

  request(url: string, config?: RequestInit, nothen?: boolean) {
    config = config || {};
    const headers = <Headers>config.headers || new Headers();
    headers.set(`Authorization`, `Bearer ${this.accessToken}`);
    config.headers = headers;
    const doFetch = () => fetch(url, config);
    const retryWithFreshToken = async () => {
      const token = await AuthVerify("googledrive", true);
      this.accessToken = token;
      headers.set(`Authorization`, `Bearer ${this.accessToken}`);
      return doFetch();
    };
    if (nothen) {
      return doFetch().then(async (resp) => {
        if (resp.status === 401) {
          resp = await retryWithFreshToken();
        }
        if (!resp.ok) {
          throw await this.createResponseError(resp);
        }
        return resp;
      });
    }
    return doFetch()
      .then(async (resp) => {
        if (resp.status === 401) {
          resp = await retryWithFreshToken();
        }
        if (!resp.ok) {
          throw await this.createResponseError(resp);
        }
        return resp.json();
      })
      .then(async (data) => {
        if (data.error) {
          if (data.error.code === 401) {
            // Token可能过期，尝试刷新
            return retryWithFreshToken()
              .then(async (retryResp) => {
                if (!retryResp.ok) {
                  throw await this.createResponseError(retryResp);
                }
                return retryResp.json();
              })
              .then((retryData) => {
                if (retryData.error) {
                  throw this.createRequestError(retryData);
                }
                return retryData;
              });
          }
          throw this.createRequestError(data);
        }
        return data;
      });
  }
  async delete(path: string, opts?: FileDeleteOptions): Promise<void> {
    const fullPath = joinPath(this.path, path);
    const expected = parseGoogleDriveDeleteVersion(opts?.expectedVersion);

    // 首先，找到要删除的文件或文件夹
    const fileId = expected?.fileId || (await this.getFileId(fullPath));
    if (!fileId) {
      return;
    }
    if (expected?.version || opts?.expectedDigest) {
      // Google Drive delete 没有使用服务端 If-Match；这里先读 version/md5Checksum 再删除。
      // 这只能发现删除前已经过期的本地快照，不能消除检查后到删除前的并发更新窗口。
      const metadata = await this.request(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=version,md5Checksum&spaces=appDataFolder`
      );
      const currentVersion = metadata?.version ? String(metadata.version) : undefined;
      const currentDigest = metadata?.md5Checksum ? String(metadata.md5Checksum) : undefined;
      if (
        (expected?.version && currentVersion !== expected.version) ||
        (opts?.expectedDigest && currentDigest !== opts.expectedDigest)
      ) {
        throw fileConflictError("googledrive", `Google Drive file changed before delete: ${fullPath}`, {
          status: 412,
          code: "versionMismatch",
        });
      }
    }

    // 删除文件或文件夹
    try {
      await this.request(
        `https://www.googleapis.com/drive/v3/files/${fileId}?spaces=appDataFolder`,
        {
          method: "DELETE",
        },
        true
      );
    } catch (error) {
      if (isNotFoundError(error)) {
        this.clearRelatedCache(fullPath);
        return;
      }
      throw error;
    }

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
    try {
      return await this.listWithResolvedFolder();
    } catch (error) {
      if (this.path === "/" || !isNotFoundError(error)) {
        throw error;
      }
      this.clearPathCache();
      return this.listWithResolvedFolder();
    }
  }

  private async listWithResolvedFolder(): Promise<FileInfo[]> {
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
      url.searchParams.set(
        "fields",
        "files(id,name,mimeType,size,md5Checksum,createdTime,modifiedTime,version),nextPageToken"
      );
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
            // 将 fileId 和 Drive version 编进 version，供写入/删除前做 best-effort 过期检查。
            // 这不是服务端原子 CAS；Google Drive 路径仍然只能降低风险，不能完全消除并发窗口。
            version: item.version ? `${item.id}:${item.version}` : item.id,
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
    const files = await this.findFilesInDirectory(fileName, parentId);
    if (files.length > 1) {
      throw fileConflictError("googledrive", `Duplicate Google Drive files found: ${fileName}`, {
        status: 409,
        code: "nameAlreadyExists",
      });
    }
    return files[0]?.id || null;
  }

  async findFilesInDirectory(fileName: string, parentId: string): Promise<Array<{ id: string }>> {
    const query = `name='${fileName}' and '${parentId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`;
    const response = await this.request(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&spaces=appDataFolder`
    );

    return response.files || [];
  }

  clearPathCache(path?: string): void {
    if (!path) {
      this.pathToIdCache.clear();
      return;
    }

    const fullPath = joinPath(path);
    const pathsToRemove = Array.from(this.pathToIdCache.keys()).filter(
      (p) => p === fullPath || p.startsWith(`${fullPath}/`)
    );
    pathsToRemove.forEach((p) => this.pathToIdCache.delete(p));
  }

  // 清除相关缓存
  clearRelatedCache(path: string): void {
    this.clearPathCache(path);
  }

  async getDirUrl(): Promise<string> {
    throw new Error("Method not implemented.");
  }

  // 确保目录存在并返回目录ID，优化Writer避免重复获取
  async ensureDirExists(dirPath: string): Promise<string> {
    return this.ensureDirPath(dirPath);
  }
}

function parseGoogleDriveDeleteVersion(version?: string): { fileId: string; version?: string } | undefined {
  if (!version) return undefined;
  const index = version.indexOf(":");
  if (index === -1) {
    return { fileId: version };
  }
  return {
    fileId: version.substring(0, index),
    version: version.substring(index + 1) || undefined,
  };
}
