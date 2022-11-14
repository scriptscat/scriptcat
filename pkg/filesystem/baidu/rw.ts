/* eslint-disable max-classes-per-file */
/* eslint-disable import/prefer-default-export */
import { calculateMd5 } from "@App/pkg/utils/utils";
import { MD5 } from "crypto-js";
import { File, FileReader, FileWriter } from "../filesystem";
import BaiduFileSystem from "./baidu";

export class BaiduFileReader implements FileReader {
  file: File;

  fs: BaiduFileSystem;

  constructor(fs: BaiduFileSystem, file: File) {
    this.fs = fs;
    this.file = file;
  }

  async read(type?: "string" | "blob"): Promise<string | Blob> {
    switch (type) {
      case "string":
        return this.client.getFileContents(this.path, {
          format: "text",
        }) as Promise<string>;
      default: {
        const resp = (await this.client.getFileContents(this.path, {
          format: "binary",
        })) as ArrayBuffer;
        return Promise.resolve(new Blob([resp]));
      }
    }
  }
}

export class BaiduFileWriter implements FileWriter {
  path: string;

  fs: BaiduFileSystem;

  constructor(fs: BaiduFileSystem, path: string) {
    this.fs = fs;
    this.path = path;
  }

  size(content: string | Blob) {
    if (content instanceof Blob) {
      return content.size;
    }
    return content.length;
  }

  async md5(content: string | Blob) {
    if (content instanceof Blob) {
      return calculateMd5(content);
    }
    return MD5(content).toString();
  }

  async write(content: string | Blob): Promise<void> {
    // 预上传获取id
    const size = this.size(content).toString();
    const md5 = await this.md5(content);
    const blockList: string[] = [md5];
    let urlencoded = new URLSearchParams();
    urlencoded.append("path", this.path);
    urlencoded.append("size", size);
    urlencoded.append("isdir", "0");
    urlencoded.append("autoinit", "1");
    urlencoded.append("rtype", "3");
    urlencoded.append("block_list", JSON.stringify(blockList));
    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/x-www-form-urlencoded");
    const uploadid = await this.fs
      .request(
        `http://pan.baidu.com/rest/2.0/xpan/file?method=precreate&access_token=${this.fs.accessToken}`,
        {
          method: "POST",
          headers: myHeaders,
          body: urlencoded,
        }
      )
      .then((data) => {
        if (data.errno) {
          throw new Error(data);
        }
        return data.uploadid;
      });
    const body = new FormData();
    if (content instanceof Blob) {
      // 分片上传
      body.append("file", content);
    } else {
      body.append("file", new Blob([content]));
    }

    await this.fs
      .request(
        `${
          `https://d.pcs.baidu.com/rest/2.0/pcs/superfile2?method=upload&access_token=${this.fs.accessToken}` +
          `&type=tmpfile&path=`
        }${this.path}&uploadid=${uploadid}&partseq=0`,
        {
          method: "POST",
          body,
        }
      )
      .then((data) => {
        if (data.errno) {
          throw new Error(data);
        }
        return data;
      });
    // 创建文件
    urlencoded = new URLSearchParams();
    urlencoded.append("path", this.path);
    urlencoded.append("size", size);
    urlencoded.append("isdir", "0");
    urlencoded.append("block_list", JSON.stringify(blockList));
    urlencoded.append("uploadid", uploadid);
    urlencoded.append("rtype", "3");
    return this.fs
      .request(
        `https://pan.baidu.com/rest/2.0/xpan/file?method=create&access_token=${this.fs.accessToken}`,
        {
          method: "POST",
          headers: myHeaders,
          body: urlencoded,
        }
      )
      .then((data) => {
        if (data.errno) {
          throw new Error(data);
        }
        return Promise.resolve();
      });
  }
}
