import { AuthVerify } from "../auth";
import type { FileInfo, FileReader, FileWriter } from "../filesystem";
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

  async create(path: string): Promise<FileWriter> {
    return new OneDriveFileWriter(this, joinPath(this.path, path));
  }

  async createDir(dir: string): Promise<void> {
    if (dir && dir.startsWith("ScriptCat")) {
      dir = dir.substring(9);
      if (dir.startsWith("/")) {
        dir = dir.substring(1);
      }
    }
    if (!dir) {
      return;
    }
    dir = joinPath(this.path, dir);
    const dirs = dir.split("/");
    let parent = "";
    if (dirs.length > 2) {
      parent = dirs.slice(0, dirs.length - 1).join("/");
    }
    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/json");
    if (parent !== "") {
      parent = `:${parent}:`;
    }
    const data = await this.request(`https://graph.microsoft.com/v1.0/me/drive/special/approot${parent}/children`, {
      method: "POST",
      headers: myHeaders,
      body: JSON.stringify({
        name: dirs[dirs.length - 1],
        folder: {},
        "@microsoft.graph.conflictBehavior": "replace",
      }),
    });
    if (data.errno) {
      throw new Error(JSON.stringify(data));
    }
  }

  request(url: string, config?: RequestInit, nothen?: boolean): Promise<Response | any> {
    config = config || {};
    const headers = <Headers>config.headers || new Headers();
    if (!url.includes("uploadSession")) {
      headers.append(`Authorization`, `Bearer ${this.accessToken}`);
    }
    config.headers = headers;
    const ret = fetch(url, config);
    if (nothen) {
      return <Promise<Response>>ret;
    }
    return ret
      .then((data) => data.json())
      .then(async (data) => {
        if (data.error) {
          if (data.error.code === "InvalidAuthenticationToken") {
            const token = await AuthVerify("onedrive", true);
            this.accessToken = token;
            headers.set(`Authorization`, `Bearer ${this.accessToken}`);
            return fetch(url, config)
              .then((retryData) => retryData.json())
              .then((retryData) => {
                if (retryData.error) {
                  throw new Error(JSON.stringify(retryData));
                }
                return data;
              });
          }
          throw new Error(JSON.stringify(data));
        }
        return data;
      });
  }

  async delete(path: string): Promise<void> {
    const resp = await this.request(
      `https://graph.microsoft.com/v1.0/me/drive/special/approot:${joinPath(this.path, path)}`,
      {
        method: "DELETE",
      },
      true
    );
    if (resp.status !== 204) {
      throw new Error(await resp.text());
    }
    return resp;
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
