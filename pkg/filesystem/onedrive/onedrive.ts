/* eslint-disable no-unused-vars */
import IoC from "@App/app/ioc";
import { SystemConfig } from "@App/pkg/config/config";
import { AuthVerify } from "../auth";
import FileSystem, { File, FileReader, FileWriter } from "../filesystem";
import { joinPath } from "../utils";
import { OneDriveFileReader, OneDriveFileWriter } from "./rw";

export default class OneDriveFileSystem implements FileSystem {
  accessToken?: string;

  path: string;

  systemConfig: SystemConfig;

  constructor(path?: string, accessToken?: string) {
    this.path = path || "/";
    this.accessToken = accessToken;
    this.systemConfig = IoC.instance(SystemConfig) as SystemConfig;
  }

  async verify(): Promise<void> {
    const token = await AuthVerify("onedrive");
    this.accessToken = token;
    return Promise.resolve();
  }

  open(file: File): Promise<FileReader> {
    return Promise.resolve(new OneDriveFileReader(this, file));
  }

  openDir(path: string): Promise<FileSystem> {
    if (path.startsWith("ScriptCat")) {
      path = path.substring(9);
    }
    return Promise.resolve(
      new OneDriveFileSystem(joinPath(this.path, path), this.accessToken)
    );
  }

  create(path: string): Promise<FileWriter> {
    return Promise.resolve(
      new OneDriveFileWriter(this, joinPath(this.path, path))
    );
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
      parent = dirs.slice(0, dirs.length - 2).join("/");
    }
    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/json");
    return this.request(
      `https://graph.microsoft.com/v1.0/me/drive/special/approot:${parent}/${
        dirs[dirs.length - 1]
      }:/children`,
      {
        method: "POST",
        headers: myHeaders,
        body: JSON.stringify({
          name: dirs[dirs.length - 1],
          folder: {},
          "@microsoft.graph.conflictBehavior": "replace",
        }),
      }
    ).then((data) => {
      if (data.errno) {
        throw new Error(JSON.stringify(data));
      }
      return Promise.resolve();
    });
  }

  // eslint-disable-next-line no-undef
  request(url: string, config?: RequestInit, nothen?: boolean) {
    config = config || {};
    const headers = <Headers>config.headers || new Headers();
    // 利用GM函数的匿名实现不发送cookie,因为某些情况cookie会导致-6错误
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
          throw new Error(JSON.stringify(data));
        }
        return data;
      });
  }

  delete(path: string): Promise<void> {
    return this.request(
      `https://graph.microsoft.com/v1.0/me/drive/special/approot:${joinPath(
        this.path,
        path
      )}`,
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
    return this.request(
      `https://graph.microsoft.com/v1.0/me/drive/special/approot:${this.path}:/children`
    ).then((data) => {
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
}
