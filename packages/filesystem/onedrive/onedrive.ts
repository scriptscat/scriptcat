import { AuthVerify } from "../auth";
import { FileSystemError, isNotFoundError } from "../error";
import type { FileInfo, FileCreateOptions, FileReader, FileWriter } from "../filesystem";
import type FileSystem from "../filesystem";
import { joinPath } from "../utils";
import { OneDriveFileReader, OneDriveFileWriter } from "./rw";

export default class OneDriveFileSystem implements FileSystem {
  accessToken?: string;

  path: string;

  constructor(path?: string, accessToken?: string) {
    this.path = path || "/";
    this.accessToken = accessToken;
  }

  async verify(): Promise<void> {
    const token = await AuthVerify("onedrive");
    this.accessToken = token;
    return this.list().then();
  }

  async open(file: FileInfo): Promise<FileReader> {
    return new OneDriveFileReader(this, file);
  }

  async openDir(path: string): Promise<FileSystem> {
    if (path.startsWith("ScriptCat")) {
      path = path.substring(9);
    }
    return new OneDriveFileSystem(joinPath(this.path, path), this.accessToken);
  }

  async create(path: string, opts?: FileCreateOptions): Promise<FileWriter> {
    return new OneDriveFileWriter(this, joinPath(this.path, path), opts);
  }

  async createDir(dir: string, _opts?: FileCreateOptions): Promise<void> {
    if (dir && dir.startsWith("ScriptCat")) {
      dir = dir.substring(9);
      if (dir.startsWith("/")) {
        dir = dir.substring(1);
      }
    }
    if (!dir) {
      return;
    }
    const dirs = joinPath(this.path, dir).split("/").filter(Boolean);
    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/json");

    for (let i = 0; i < dirs.length; i++) {
      const parentPath = dirs.slice(0, i).join("/");
      const parent = parentPath ? `:/${parentPath}:` : "";
      try {
        await this.request(`https://graph.microsoft.com/v1.0/me/drive/special/approot${parent}/children`, {
          method: "POST",
          headers: myHeaders,
          body: JSON.stringify({
            name: dirs[i],
            folder: {},
            "@microsoft.graph.conflictBehavior": "fail",
          }),
        });
      } catch (error) {
        if (this.isDirectoryAlreadyExistsError(error)) {
          continue;
        }
        throw error;
      }
    }
  }

  private isDirectoryAlreadyExistsError(error: unknown): boolean {
    if (error instanceof FileSystemError && error.conflict) {
      return true;
    }
    const msg = String(error);
    return msg.includes("nameAlreadyExists") || msg.includes("itemAlreadyExists");
  }

  private createRequestError(raw: unknown, status?: number): FileSystemError {
    const errorBody =
      raw && typeof raw === "object" && "error" in raw ? (raw as { error?: Record<string, unknown> }).error : undefined;
    const code = typeof errorBody?.code === "string" ? errorBody.code : undefined;
    const message =
      typeof errorBody?.message === "string"
        ? errorBody.message
        : typeof raw === "string" && raw
          ? raw
          : `OneDrive request failed${status ? ` with status ${status}` : ""}`;
    const auth = status === 401 || code === "InvalidAuthenticationToken";
    const notFound = status === 404 || code === "itemNotFound";
    const conflict =
      status === 409 ||
      status === 412 ||
      code === "nameAlreadyExists" ||
      code === "itemAlreadyExists" ||
      code === "PreconditionFailed";
    const rateLimit = status === 429;

    return new FileSystemError({
      provider: "onedrive",
      message,
      status,
      code,
      auth,
      notFound,
      conflict,
      rateLimit,
      retryable: rateLimit || (status !== undefined && status >= 500),
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

  request(url: string, config?: RequestInit, nothen?: boolean): Promise<Response | any> {
    config = config || {};
    const headers = <Headers>config.headers || new Headers();
    if (!url.includes("uploadSession")) {
      headers.set(`Authorization`, `Bearer ${this.accessToken}`);
    }
    config.headers = headers;
    const doFetch = () => fetch(url, config);
    const retryWithFreshToken = async () => {
      const token = await AuthVerify("onedrive", true);
      this.accessToken = token;
      if (!url.includes("uploadSession")) {
        headers.set(`Authorization`, `Bearer ${this.accessToken}`);
      }
      return doFetch();
    };
    if (nothen) {
      return doFetch().then(async (resp) => {
        if (resp.status === 401 && !url.includes("uploadSession")) {
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
        if (resp.status === 401 && !url.includes("uploadSession")) {
          resp = await retryWithFreshToken();
        }
        if (!resp.ok) {
          throw await this.createResponseError(resp);
        }
        return resp.json();
      })
      .then(async (data) => {
        if (data.error) {
          if (data.error.code === "InvalidAuthenticationToken") {
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

  async delete(path: string): Promise<void> {
    try {
      await this.request(
        `https://graph.microsoft.com/v1.0/me/drive/special/approot:${joinPath(this.path, path)}`,
        {
          method: "DELETE",
        },
        true
      );
    } catch (error) {
      if (isNotFoundError(error)) {
        return;
      }
      throw error;
    }
  }

  async list(): Promise<FileInfo[]> {
    let { path } = this;
    if (path === "/") {
      path = "";
    } else {
      path = `:${path}:`;
    }

    const list: FileInfo[] = [];
    let nextLink: string | undefined = `https://graph.microsoft.com/v1.0/me/drive/special/approot${path}/children`;
    let iterationCount = 0;
    const MAX_ITERATIONS = 100;

    while (nextLink) {
      iterationCount += 1;
      if (iterationCount > MAX_ITERATIONS) {
        throw new Error("OneDrive list pagination exceeded maximum iterations");
      }
      const data = await this.request(nextLink);

      if (data.value) {
        for (const val of data.value) {
          list.push({
            name: val.name,
            path: this.path,
            size: val.size,
            digest: val.eTag,
            version: val.eTag,
            createtime: new Date(val.createdDateTime).getTime(),
            updatetime: new Date(val.lastModifiedDateTime).getTime(),
          });
        }
      }

      nextLink = data["@odata.nextLink"];
    }

    return list;
  }

  getDirUrl(): Promise<string> {
    throw new Error("Method not implemented.");
  }
}
