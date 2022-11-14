/* eslint-disable no-unused-vars */
import { AuthVerify } from "../auth";
import FileSystem, { File, FileReader, FileWriter } from "../filesystem";
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
    this.accessToken = token.accessToken;
    return Promise.resolve();
  }

  open(file: File): Promise<FileReader> {
    // 获取fsid
    return Promise.resolve(new BaiduFileReader(this, file));
  }

  openDir(path: string): Promise<FileSystem> {
    return Promise.resolve(
      new BaiduFileSystem(`${this.path}/${path}`, this.accessToken)
    );
  }

  create(path: string): Promise<FileWriter> {
    return Promise.resolve(new BaiduFileWriter(this, `${this.path}/${path}`));
  }

  createDir(dir: string): Promise<void> {
    dir = dir ? `${this.path}/${dir}` : this.path;
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
        throw new Error(data);
      }
      return Promise.resolve();
    });
  }

  // eslint-disable-next-line no-undef
  request(url: string, config?: RequestInit) {
    return fetch(url, config)
      .then((data) => data.json())
      .then(async (data) => {
        if (data.errno === 111) {
          await this.verify();
          return fetch(url, config)
            .then((data2) => data2.json())
            .then((data2) => {
              if (data2.errno === 111) {
                throw new Error(data2);
              }
              return data2;
            });
        }
        return data;
      });
  }

  delete(path: string): Promise<void> {
    throw new Error("Delete Method not implemented.");
  }

  list(path?: string | undefined): Promise<File[]> {
    return this.request(
      `https://pan.baidu.com/rest/2.0/xpan/file?method=list&dir=${encodeURIComponent(
        `${this.path}${path ? `/${path}` : ""}`
      )}&order=time&access_token=${this.accessToken}`
    ).then((data) => {
      // 创建文件夹
      if (data.errno) {
        if (data.errno === -9) {
          this.createDir(path || "");
          return [];
        }
        throw new Error(data);
      }
      const list: File[] = [];
      data.list.forEach((val: any) => {
        list.push({
          fsid: val.fs_id,
          name: val.server_filename,
          path: val.path.substring(0, val.path.length - val.server_filename),
          size: val.size,
          digest: val.md5,
          createtime: val.server_ctime * 1000,
          updatetime: val.server_mtime * 1000,
        });
      });
      return list;
    });
  }
}
