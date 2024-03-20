/* eslint-disable no-unused-vars */
import IoC from "@App/app/ioc";
import { SystemConfig } from "@App/pkg/config/config";
import { AuthVerify } from "../auth";
import FileSystem, { File, FileReader, FileWriter } from "../filesystem";
import { joinPath } from "../utils";
import { BaiduFileReader, BaiduFileWriter } from "./rw";

export default class BaiduFileSystem implements FileSystem {
  accessToken?: string;

  path: string;

  systemConfig: SystemConfig;

  constructor(path?: string, accessToken?: string) {
    this.path = path || "/apps";
    this.accessToken = accessToken;
    this.systemConfig = IoC.instance(SystemConfig) as SystemConfig;
  }

  async verify(): Promise<void> {
    const token = await AuthVerify("baidu");
    this.accessToken = token;
    return this.list().then();
  }

  open(file: File): Promise<FileReader> {
    // 获取fsid
    return Promise.resolve(new BaiduFileReader(this, file));
  }

  openDir(path: string): Promise<FileSystem> {
    return Promise.resolve(
      new BaiduFileSystem(joinPath(this.path, path), this.accessToken)
    );
  }

  create(path: string): Promise<FileWriter> {
    return Promise.resolve(
      new BaiduFileWriter(this, joinPath(this.path, path))
    );
  }

  createDir(dir: string): Promise<void> {
    dir = joinPath(this.path, dir);
    const urlencoded = new URLSearchParams();
    urlencoded.append("path", dir);
    urlencoded.append("size", "0");
    urlencoded.append("isdir", "1");
    urlencoded.append("rtype", "3");
    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/x-www-form-urlencoded");
    return this.request(
      `https://pan.baidu.com/rest/2.0/xpan/file?method=create&access_token=${this.accessToken}`,
      {
        method: "POST",
        headers: myHeaders,
        body: urlencoded,
        redirect: "follow",
      }
    ).then((data) => {
      if (data.errno) {
        throw new Error(JSON.stringify(data));
      }
      return Promise.resolve();
    });
  }

  // eslint-disable-next-line no-undef
  request(url: string, config?: RequestInit) {
    config = config || {};
    const headers = <Headers>config.headers || new Headers();
    // 利用GM函数的匿名实现不发送cookie,因为某些情况cookie会导致-6错误
    headers.append(`${this.systemConfig.scriptCatFlag}-gm-xhr`, "true");
    headers.append(`${this.systemConfig.scriptCatFlag}-anonymous`, "true");
    config.headers = headers;
    return fetch(url, config)
      .then((data) => data.json())
      .then(async (data) => {
        if (data.errno === 111 || data.errno === -6) {
          const token = await AuthVerify("baidu", true);
          this.accessToken = token;
          url = url.replace(/access_token=[^&]+/, `access_token=${token}`);
          return fetch(url, config)
            .then((data2) => data2.json())
            .then((data2) => {
              if (data2.errno === 111 || data2.errno === -6) {
                throw new Error(JSON.stringify(data2));
              }
              return data2;
            });
        }
        return data;
      });
  }

  delete(path: string): Promise<void> {
    const filelist = [joinPath(this.path, path)];
    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/x-www-form-urlencoded");
    return this.request(
      `https://pan.baidu.com/rest/2.0/xpan/file?method=filemanager&access_token=${this.accessToken}&opera=delete`,
      {
        method: "POST",
        body: `async=0&filelist=${encodeURIComponent(
          JSON.stringify(filelist)
        )}`,
        headers: myHeaders,
      }
    ).then((data) => {
      if (data.errno) {
        throw new Error(JSON.stringify(data));
      }
      return data;
    });
  }

  list(): Promise<File[]> {
    return this.request(
      `https://pan.baidu.com/rest/2.0/xpan/file?method=list&dir=${encodeURIComponent(
        this.path
      )}&order=time&access_token=${this.accessToken}`
    ).then((data) => {
      if (data.errno) {
        if (data.errno === -9) {
          return [];
        }
        throw new Error(JSON.stringify(data));
      }
      const list: File[] = [];
      data.list.forEach((val: any) => {
        list.push({
          fsid: val.fs_id,
          name: val.server_filename,
          path: this.path,
          size: val.size,
          digest: val.md5,
          createtime: val.server_ctime * 1000,
          updatetime: val.server_mtime * 1000,
        });
      });
      return list;
    });
  }

  getDirUrl(): Promise<string> {
    return Promise.resolve(
      `https://pan.baidu.com/disk/main#/index?category=all&path=${encodeURIComponent(
        this.path
      )}`
    );
  }
}
