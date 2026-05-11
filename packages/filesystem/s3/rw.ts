import { S3Error, type S3Client } from "./client";
import { fileConflictError } from "../error";
import type { FileCreateOptions, FileReader, FileWriter } from "../filesystem";
import { buildConditionalHeaders } from "../utils";

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

  opts?: FileCreateOptions;

  constructor(client: S3Client, bucket: string, key: string, opts?: FileCreateOptions) {
    this.client = client;
    this.bucket = bucket;
    this.key = key;
    this.modifiedDate = opts?.modifiedDate;
    this.opts = opts;
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
      // 历史兼容：S3 侧使用 createtime 元数据保存文件时间，实际来源是 FileCreateOptions.modifiedDate。
      headers["x-amz-meta-createtime"] = new Date(this.modifiedDate).toISOString();
    }
    Object.assign(headers, buildConditionalHeaders(this.opts));

    try {
      await this.client.request("PUT", this.bucket, this.key, {
        body: typeof body === "string" ? body : body,
        headers,
      });
    } catch (error) {
      if (error instanceof S3Error && (error.statusCode === 409 || error.statusCode === 412)) {
        throw fileConflictError("s3", error.message, {
          status: error.statusCode,
          code: error.code,
          raw: error,
        });
      }
      throw error;
    }
  }
}
