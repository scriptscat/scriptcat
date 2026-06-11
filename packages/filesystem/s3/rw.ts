import type { S3Client } from "./client";
import type { FileCreateOptions, FileReader, FileWriter } from "../filesystem";
import { createS3FileSystemError } from "./error";

function quoteETag(digest: string): string {
  return digest.startsWith('"') && digest.endsWith('"') ? digest : `"${digest}"`;
}

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
    try {
      const response = await this.client.request("GET", this.bucket, this.key);
      if (type === "string") {
        return response.text();
      }
      return response.blob();
    } catch (error) {
      throw createS3FileSystemError(error);
    }
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

  expectedDigest?: string;

  createOnly?: boolean;

  constructor(client: S3Client, bucket: string, key: string, opts?: FileCreateOptions) {
    this.client = client;
    this.bucket = bucket;
    this.key = key;
    this.modifiedDate = opts?.modifiedDate;
    this.expectedDigest = opts?.expectedDigest;
    this.createOnly = opts?.createOnly;
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
    if (this.expectedDigest) {
      headers["if-match"] = quoteETag(this.expectedDigest);
    } else if (this.createOnly) {
      headers["if-none-match"] = "*";
    }

    try {
      await this.client.request("PUT", this.bucket, this.key, {
        body: typeof body === "string" ? body : body,
        headers,
      });
    } catch (error) {
      throw createS3FileSystemError(error);
    }
  }
}
