import { AuthVerify } from "../auth";
import type FileSystem from "../filesystem";
import type { File, FileReader, FileWriter } from "../filesystem";
import { joinPath } from "../utils";
import { BaiduFileReader, BaiduFileWriter } from "./rw";

export default class BaiduFileSystem implements FileSystem {
  accessToken?: string;

  path: string;

  constructor(path?: string, accessToken?: string) {
    this.path = path || "/apps";
    this.accessToken = accessToken;
  }

  async verify(): Promise<void> {
    const token = await AuthVerify("baidu");
    this.accessToken = token;
    return this.list().then();
  }

  async open(file: File): Promise<FileReader> {
    // 获取fsid
    return new BaiduFileReader(this, file);
  }

  async openDir(path: string): Promise<FileSystem> {
    return new BaiduFileSystem(joinPath(this.path, path), this.accessToken);
  }

  async create(path: string): Promise<FileWriter> {
    return new BaiduFileWriter(this, joinPath(this.path, path));
  }

  async createDir(dir: string): Promise<void> {
    dir = joinPath(this.path, dir);
    const urlencoded = new URLSearchParams();
    urlencoded.append("path", dir);
    urlencoded.append("size", "0");
    urlencoded.append("isdir", "1");
    urlencoded.append("rtype", "3");
    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/x-www-form-urlencoded");
    const data = await this.request(
      `https://pan.baidu.com/rest/2.0/xpan/file?method=create&access_token=${this.accessToken}`,
      {
        method: "POST",
        headers: myHeaders,
        body: urlencoded,
        redirect: "follow",
      }
    );
    if (data.errno) {
      throw new Error(JSON.stringify(data));
    }
  }

  async request(url: string, config?: RequestInit) {
    config = config || {};
    const headers = <Headers>config.headers || new Headers();
    // 处理请求匿名不发送cookie
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [100],
      addRules: [
        {
          id: 100,
          action: {
            type: "modifyHeaders" as chrome.declarativeNetRequest.RuleActionType,
            responseHeaders: [
              {
                operation:
                  chrome?.declarativeNetRequest?.HeaderOperation?.REMOVE ??
                  ("remove" as chrome.declarativeNetRequest.HeaderOperation),
                header: "cookie",
              },
            ],
          },
          condition: {
            urlFilter: url,
            resourceTypes: [chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST],
          },
        },
      ],
    });
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
      })
      .finally(() => {
        chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: [100],
        });
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
        body: `async=0&filelist=${encodeURIComponent(JSON.stringify(filelist))}`,
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

  async getDirUrl(): Promise<string> {
    return `https://pan.baidu.com/disk/main#/index?category=all&path=${encodeURIComponent(this.path)}`;
  }
}
