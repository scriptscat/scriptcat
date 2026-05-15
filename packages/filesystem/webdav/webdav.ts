import type { FileStat, WebDAVClient, WebDAVClientOptions } from "webdav";
import { createClient, getPatcher } from "webdav";
import type FileSystem from "../filesystem";
import type { FileInfo, FileCreateOptions, FileDeleteOptions, FileReader, FileWriter } from "../filesystem";
import { buildExpectedHeaders, joinPath } from "../utils";
import { WebDAVFileReader, WebDAVFileWriter } from "./rw";
import { fileConflictError, WarpTokenError } from "../error";

// 禁止 WebDAV 请求携带浏览器 cookies，只通过账号密码认证 (#1297)
// 全局单次注册
let patchInited = false;
const initWebDAVPatch = () => {
  if (patchInited) return;
  patchInited = true;
  return getPatcher().patch("fetch", (...args: unknown[]) => {
    const options = (args[1] as RequestInit) || {};
    const headers = new Headers((options.headers as HeadersInit) || {});
    return fetch(args[0] as RequestInfo | URL, {
      ...options,
      headers,
      credentials: "omit",
    });
  });
};

export default class WebDAVFileSystem implements FileSystem {
  client: WebDAVClient;

  url: string;

  basePath: string = "/";

  static fromCredentials(url: string, options: WebDAVClientOptions) {
    initWebDAVPatch();
    options = {
      ...options,
      headers: {
        "X-Requested-With": "XMLHttpRequest", // Nextcloud 等需要
        // "requesttoken": csrfToken,          // 按账号各自传入
      },
    };
    return new WebDAVFileSystem(createClient(url, options), url, "/");
  }

  static fromSameClient(fs: WebDAVFileSystem, basePath: string) {
    return new WebDAVFileSystem(fs.client, fs.url, basePath);
  }

  private constructor(client: WebDAVClient, url: string, basePath: string) {
    this.client = client;
    this.url = url;
    this.basePath = basePath;
  }

  async verify(): Promise<void> {
    // 只做只读校验：凭据 + URL 可达性。
    // 写权限不在此处探测——不同 basePath 写策略不同（坚果云等根目录不可写的服务会被误杀，见 #1444），
    // 真正的写操作会在 backupToCloud / buildFileSystem 中由 createDir 立即触发并报错。
    try {
      await this.client.getQuota();
      await this.client.getDirectoryContents(this.basePath);
    } catch (e: any) {
      if (e.response?.status === 401) {
        throw new WarpTokenError(e);
      }
      throw new Error(`WebDAV verify failed: ${e.message}`); // 保留原始信息
    }
  }

  async open(file: FileInfo): Promise<FileReader> {
    return new WebDAVFileReader(this.client, joinPath(file.path, file.name));
  }

  async openDir(path: string): Promise<FileSystem> {
    return WebDAVFileSystem.fromSameClient(this, joinPath(this.basePath, path));
  }

  async create(path: string, opts?: FileCreateOptions): Promise<FileWriter> {
    return new WebDAVFileWriter(this.client, joinPath(this.basePath, path), opts);
  }

  async createDir(path: string, _opts?: FileCreateOptions): Promise<void> {
    try {
      await this.client.createDirectory(joinPath(this.basePath, path));
    } catch (e: any) {
      // 如果是405错误,则忽略
      if (e.response?.status === 405 || e.message?.includes("405")) {
        return;
      }
      throw e;
    }
  }

  async delete(path: string, opts?: FileDeleteOptions): Promise<void> {
    try {
      const headers = buildExpectedHeaders(opts);
      if (Object.keys(headers).length) {
        await this.client.deleteFile(joinPath(this.basePath, path), { headers });
      } else {
        await this.client.deleteFile(joinPath(this.basePath, path));
      }
    } catch (e: any) {
      if (e.response?.status === 409 || e.response?.status === 412) {
        throw fileConflictError("webdav", e.message || "WebDAV conditional delete failed", {
          status: e.response.status,
          raw: e,
        });
      }
      if (e.response?.status === 404 || e.message?.includes("404")) {
        return;
      }
      throw e;
    }
  }

  async list(): Promise<FileInfo[]> {
    let dir: FileStat[];
    try {
      dir = (await this.client.getDirectoryContents(this.basePath)) as FileStat[];
    } catch (e: any) {
      if (e.response?.status === 404) return [] as FileInfo[]; // 目录不存在视为空
      throw e;
    }
    const ret: FileInfo[] = [];
    for (const item of dir) {
      if (item.type !== "file") {
        continue;
      }
      const time = new Date(item.lastmod).getTime();
      ret.push({
        name: item.basename,
        path: this.basePath,
        digest: item.etag || "",
        version: item.etag || "",
        size: item.size,
        createtime: time,
        updatetime: time,
      });
    }
    return ret;
  }

  async getDirUrl(): Promise<string> {
    return this.url + this.basePath;
  }
}
