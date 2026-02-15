import type { S3Client } from "./client";
import type { FileReader, FileWriter } from "../filesystem";

/**
 * S3 文件读取器
 * 通过 GET 请求下载 S3 对象
 */
export class S3FileReader implements FileReader {
  client: S3Client;

  bucket: string;

  key: string;

  constructor(client: S3Client, bucket: string, key: string) {
    this.client = client;
    this.bucket = bucket;
    this.key = key;
  }

  /**
   * 读取文件内容
   * @param type 输出格式："string" 为文本，"blob" 为二进制（默认）
   * @returns 文件内容
   * @throws {S3Error} 文件不存在或读取失败
   */
  async read(type: "string" | "blob" = "blob"): Promise<string | Blob> {
    const response = await this.client.request("GET", this.bucket, this.key);
    if (type === "string") {
      return response.text();
    }
    return response.blob();
  }
}

/**
 * S3 文件写入器
 * 通过 PUT 请求上传内容到 S3
 */
export class S3FileWriter implements FileWriter {
  client: S3Client;

  bucket: string;

  key: string;

  modifiedDate?: number;

  constructor(client: S3Client, bucket: string, key: string, modifiedDate?: number) {
    this.client = client;
    this.bucket = bucket;
    this.key = key;
    this.modifiedDate = modifiedDate;
  }

  /**
   * 写入文件内容
   * @param content 文件内容（字符串或 Blob）
   * @throws {S3Error} 上传失败
   */
  async write(content: string | Blob): Promise<void> {
    const body = content instanceof Blob ? new Uint8Array(await content.arrayBuffer()) : content;

    const headers: Record<string, string> = {
      "content-type": "application/octet-stream",
    };
    if (this.modifiedDate) {
      // 通过自定义元数据保存创建时间（ISO 8601 格式）
      headers["x-amz-meta-createtime"] = new Date(this.modifiedDate).toISOString();
    }

    await this.client.request("PUT", this.bucket, this.key, {
      body: typeof body === "string" ? body : body,
      headers,
    });
  }
}
