import type { FileInfo, FileReader, FileWriter } from "../filesystem";
import { calculateMd5, md5OfText } from "@App/pkg/utils/crypto";
import type BaiduFileSystem from "./baidu";

export class BaiduFileReader implements FileReader {
  file: FileInfo;

  fs: BaiduFileSystem;

  constructor(fs: BaiduFileSystem, file: FileInfo) {
    this.fs = fs;
    this.file = file;
  }

  async read(type?: "string" | "blob"): Promise<string | Blob> {
    // 查询文件信息获取dlink
    const data = await this.fs.request(
      `https://pan.baidu.com/rest/2.0/xpan/multimedia?method=filemetas&access_token=${
        this.fs.accessToken
      }&fsids=[${this.file.fsid!}]&dlink=1`
    );
    if (!data.list.length) {
      throw new Error("file not found");
    }
    const resp = await fetch(`${data.list[0].dlink}&access_token=${this.fs.accessToken}`);
    switch (type) {
      case "string":
        return await resp.text();
      default: {
        return await resp.blob();
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
    return new Blob([content]).size;
  }

  async md5(content: string | Blob) {
    if (content instanceof Blob) {
      return calculateMd5(content);
    }
    return md5OfText(content);
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
    let data = await this.fs.request(
      `http://pan.baidu.com/rest/2.0/xpan/file?method=precreate&access_token=${this.fs.accessToken}`,
      {
        method: "POST",
        headers: myHeaders,
        body: urlencoded,
      }
    );
    if (data.errno) {
      throw new Error(JSON.stringify(data));
    }
    const uploadid = data.uploadid;
    const body = new FormData();
    if (content instanceof Blob) {
      // 分片上传
      body.append("file", content);
    } else {
      body.append("file", new Blob([content]));
    }

    data = await this.fs.request(
      `${
        `https://d.pcs.baidu.com/rest/2.0/pcs/superfile2?method=upload&access_token=${this.fs.accessToken}` +
        `&type=tmpfile&path=`
      }${encodeURIComponent(this.path)}&uploadid=${uploadid}&partseq=0`,
      {
        method: "POST",
        body,
      }
    );
    if (data.errno) {
      throw new Error(JSON.stringify(data));
    }
    // 创建文件
    urlencoded = new URLSearchParams();
    urlencoded.append("path", this.path);
    urlencoded.append("size", size);
    urlencoded.append("isdir", "0");
    urlencoded.append("block_list", JSON.stringify(blockList));
    urlencoded.append("uploadid", uploadid);
    urlencoded.append("rtype", "3");
    data = await this.fs.request(
      `https://pan.baidu.com/rest/2.0/xpan/file?method=create&access_token=${this.fs.accessToken}`,
      {
        method: "POST",
        headers: myHeaders,
        body: urlencoded,
      }
    );
    if (data.errno) {
      throw new Error(JSON.stringify(data));
    }
  }
}
