import { AuthVerify } from "../auth";
import FileSystem, { File, FileReader, FileWriter } from "../filesystem";
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

  open(file: File): Promise<FileReader> {
    return Promise.resolve(new OneDriveFileReader(this, file));
  }

  openDir(path: string): Promise<FileSystem> {
    if (path.startsWith("ScriptCat")) {
      path = path.substring(9);
    }
    return Promise.resolve(new OneDriveFileSystem(joinPath(this.path, path), this.accessToken));
  }

  create(path: string): Promise<FileWriter> {
    return Promise.resolve(new OneDriveFileWriter(this, joinPath(this.path, path)));
  }

  createDir(dir: string): Promise<void> {
    if (dir && dir.startsWith("ScriptCat")) {
      dir = dir.substring(9);
      if (dir.startsWith("/")) {
        dir = dir.substring(1);
      }
    }
    if (!dir) {
      return Promise.resolve();
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
    return this.request(`https://graph.microsoft.com/v1.0/me/drive/special/approot${parent}/children`, {
      method: "POST",
      headers: myHeaders,
      body: JSON.stringify({
        name: dirs[dirs.length - 1],
        folder: {},
        "@microsoft.graph.conflictBehavior": "replace",
      }),
    }).then((data: any) => {
      if (data.errno) {
        throw new Error(JSON.stringify(data));
      }
      return Promise.resolve();
    });
  }

  request(url: string, config?: RequestInit, nothen?: boolean) {
    config = config || {};
    const headers = <Headers>config.headers || new Headers();
    if (url.indexOf("uploadSession") === -1) {
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

  delete(path: string): Promise<void> {
    return this.request(
      `https://graph.microsoft.com/v1.0/me/drive/special/approot:${joinPath(this.path, path)}`,
      {
        method: "DELETE",
      },
      true
    ).then(async (resp) => {
      if (resp.status !== 204) {
        throw new Error(await resp.text());
      }
      return resp;
    });
  }

  list(): Promise<File[]> {
    let { path } = this;
    if (path === "/") {
      path = "";
    } else {
      path = `:${path}:`;
    }
    return this.request(`https://graph.microsoft.com/v1.0/me/drive/special/approot${path}/children`).then((data) => {
      const list: File[] = [];
      data.value.forEach((val: any) => {
        list.push({
          name: val.name,
          path: this.path,
          size: val.size,
          digest: val.eTag,
          createtime: new Date(val.createdDateTime).getTime(),
          updatetime: new Date(val.lastModifiedDateTime).getTime(),
        });
      });
      return list;
    });
  }

  getDirUrl(): Promise<string> {
    throw new Error("Method not implemented.");
  }
}
