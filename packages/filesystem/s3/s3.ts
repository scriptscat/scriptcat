import { S3Client, S3Error } from "./client";
import type { S3ClientConfig } from "./client";
import type FileSystem from "../filesystem";
import type { FileInfo, FileCreateOptions, FileReader, FileWriter } from "../filesystem";
import { joinPath } from "../utils";
import { S3FileReader, S3FileWriter } from "./rw";
import { WarpTokenError } from "../error";

// ---- ListObjectsV2 XML 解析 ----

interface ListObjectsV2Result {
  contents: Array<{
    key: string;
    lastModified: string;
    etag: string;
    size: number;
  }>;
  isTruncated: boolean;
  nextContinuationToken?: string;
}

/** 从 ListObjectsV2 XML 响应中解析对象列表 */
function parseListObjectsV2(xml: string): ListObjectsV2Result {
  const contents: ListObjectsV2Result["contents"] = [];
  const contentsRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
  let match;
  while ((match = contentsRegex.exec(xml)) !== null) {
    const block = match[1];
    const key = block.match(/<Key>([\s\S]*?)<\/Key>/)?.[1] || "";
    const lastModified = block.match(/<LastModified>([\s\S]*?)<\/LastModified>/)?.[1] || "";
    const etag = block.match(/<ETag>([\s\S]*?)<\/ETag>/)?.[1] || "";
    const size = parseInt(block.match(/<Size>([\s\S]*?)<\/Size>/)?.[1] || "0", 10);
    contents.push({ key, lastModified, etag, size });
  }

  const isTruncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
  const nextToken = xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1];

  return { contents, isTruncated, nextContinuationToken: nextToken };
}

// ---- S3 文件系统 ----

/**
 * Amazon S3 文件系统实现
 * 支持 AWS S3 及兼容服务（MinIO、Wasabi 等）
 * 使用原生 fetch + AWS Signature V4 签名，不依赖 @aws-sdk/client-s3
 */
export default class S3FileSystem implements FileSystem {
  client: S3Client;

  bucket: string;

  basePath: string = "/";

  constructor(bucket: string, client: S3Client, basePath?: string);
  constructor(
    bucket: string,
    region: string,
    accessKeyId: string,
    secretAccessKey: string,
    endpoint?: string,
    basePath?: string
  );
  constructor(
    bucket: string,
    regionOrClient: string | S3Client,
    accessKeyIdOrBasePath?: string,
    secretAccessKey?: string,
    endpoint?: string,
    basePath?: string
  ) {
    this.bucket = bucket;
    if (regionOrClient instanceof S3Client) {
      this.client = regionOrClient;
      this.basePath = accessKeyIdOrBasePath || "/";
      return;
    }
    this.basePath = basePath || "/";

    const config: S3ClientConfig = {
      region: regionOrClient || "us-east-1",
      credentials: {
        accessKeyId: accessKeyIdOrBasePath!,
        secretAccessKey: secretAccessKey!,
      },
      forcePathStyle: true, // 强制路径式访问，兼容大多数 S3 服务
    };

    if (endpoint) {
      let fixedEndpoint = `${endpoint}`.trim();
      if (!fixedEndpoint.startsWith("http://") && !fixedEndpoint.startsWith("https://")) {
        fixedEndpoint = `https://${fixedEndpoint}`;
      }
      config.endpoint = fixedEndpoint;
      // amazonaws.com 域名使用虚拟主机风格
      if (endpoint.includes("amazonaws.com")) config.forcePathStyle = false;
    }

    this.client = new S3Client(config);
  }

  /**
   * 验证 Bucket 访问权限和凭证
   * @throws {WarpTokenError} 认证失败
   * @throws {Error} Bucket 不存在或网络错误
   */
  async verify(): Promise<void> {
    try {
      await this.client.request("HEAD", this.bucket);
    } catch (error: any) {
      if (error instanceof S3Error) {
        if (error.code === "NotFound" || error.code === "NoSuchBucket" || error.statusCode === 404) {
          throw new Error("NotFound");
        }
        if (
          error.code === "InvalidAccessKeyId" ||
          error.code === "SignatureDoesNotMatch" ||
          error.code === "InvalidClientTokenId"
        ) {
          throw new WarpTokenError(error);
        }
        if (
          error.code === "AccessDenied" ||
          error.code === "PermanentRedirect" ||
          error.statusCode === 403 ||
          error.statusCode === 301
        ) {
          throw new Error("Access Denied");
        }
      }
      if (error.message?.includes("getaddrinfo") || error.message?.includes("fetch failed")) {
        throw new Error("Network connection failed. Please check your internet connection.");
      }
      throw error;
    }
  }

  /**
   * 打开文件用于读取
   * @param file 文件信息
   * @returns 文件读取器
   */
  async open(file: FileInfo): Promise<FileReader> {
    const key = joinPath(file.path, file.name).substring(1); // 去除前导 /
    return new S3FileReader(this.client, this.bucket, key);
  }

  /**
   * 打开子目录（返回新的 S3FileSystem 实例）
   * @param path 相对于当前 basePath 的目录路径
   * @returns 新的 S3FileSystem 实例
   */
  async openDir(path: string): Promise<FileSystem> {
    return new S3FileSystem(this.bucket, this.client, joinPath(this.basePath, path));
  }

  /**
   * 创建文件用于写入
   * @param path 相对于当前 basePath 的文件路径
   * @param opts 可选的文件创建选项
   * @returns 文件写入器
   */
  async create(path: string, opts?: FileCreateOptions): Promise<FileWriter> {
    return new S3FileWriter(this.client, this.bucket, joinPath(this.basePath, path).substring(1), opts?.modifiedDate);
  }

  /**
   * 创建目录（S3 中目录是隐式的，无需操作）
   */
  async createDir(_path: string, _opts?: FileCreateOptions): Promise<void> {
    return Promise.resolve();
  }

  /**
   * 删除文件
   * 此操作幂等——删除不存在的文件也会成功
   * @param path 相对于当前 basePath 的文件路径
   */
  async delete(path: string): Promise<void> {
    try {
      await this.client.request("DELETE", this.bucket, joinPath(this.basePath, path).substring(1));
    } catch (error: any) {
      // S3 delete 是幂等的，key 不存在时也视为成功
      if (error instanceof S3Error && error.code === "NoSuchKey") {
        return;
      }
      throw error;
    }
  }

  /**
   * 列出当前目录下的文件
   * 自动处理分页
   * @returns 文件信息数组
   */
  async list(): Promise<FileInfo[]> {
    let prefix = this.basePath === "/" ? "" : this.basePath.substring(1);
    // 确保 prefix 以 / 结尾（除了根目录），这样才能正确列出目录下的文件
    if (prefix && !prefix.endsWith("/")) {
      prefix += "/";
    }
    const files: FileInfo[] = [];
    let continuationToken: string | undefined;

    try {
      do {
        const queryParams: Record<string, string> = {
          "list-type": "2",
          delimiter: "/",
          "max-keys": "1000",
        };
        if (prefix) queryParams["prefix"] = prefix;
        if (continuationToken) queryParams["continuation-token"] = continuationToken;

        const response = await this.client.request("GET", this.bucket, undefined, { queryParams });
        const xml = await response.text();
        const result = parseListObjectsV2(xml);

        for (const obj of result.contents) {
          if (!obj.key) continue;
          if (obj.key.endsWith("/")) continue; // 跳过目录占位符
          if (prefix && obj.key === prefix) continue; // 跳过 prefix 本身

          const relativeKey = prefix ? obj.key.slice(prefix.length) : obj.key;
          if (!relativeKey) continue;

          const lastModified = new Date(obj.lastModified).getTime() || Date.now();

          files.push({
            name: relativeKey,
            path: this.basePath,
            size: obj.size || 0,
            digest: obj.etag?.replace(/"/g, "") || "",
            createtime: lastModified,
            updatetime: lastModified,
          });
        }

        continuationToken = result.nextContinuationToken;
      } while (continuationToken);

      if (files.length > 10000) {
        console.warn(`Directory listing truncated: >10000 items under ${this.basePath}`);
      }

      return files;
    } catch (error: any) {
      if (error instanceof S3Error && error.code === "AccessDenied") {
        throw new Error(`Permission denied. Check your IAM permissions for bucket: ${this.bucket}`);
      }
      throw error;
    }
  }

  /**
   * 获取当前目录的 URL
   * 自定义 endpoint 返回 endpoint + bucket/prefix 路径
   * AWS S3 返回控制台 URL
   */
  async getDirUrl(): Promise<string> {
    const prefix = this.basePath === "/" ? "" : this.basePath.substring(1);
    if (this.client.hasCustomEndpoint()) {
      const url = this.client.getEndpointUrl();
      return `${url}/${this.bucket}/${prefix}`;
    }
    return `https://s3.console.aws.amazon.com/s3/buckets/${this.bucket}?prefix=${encodeURIComponent(prefix)}&region=${this.client.getRegion()}`;
  }
}
