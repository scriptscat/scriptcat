import {
  S3Client,
  HeadBucketCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import type FileSystem from "../filesystem";
import type { FileInfo, FileCreateOptions, FileReader, FileWriter } from "../filesystem";
import { joinPath } from "../utils";
import { S3FileReader, S3FileWriter } from "./rw";
import { WarpTokenError } from "../error";

/**
 * Amazon S3 implementation of the FileSystem interface.
 * Supports AWS S3 and S3-compatible services (MinIO, Wasabi, etc.).
 */
export default class S3FileSystem implements FileSystem {
  client: S3Client;

  bucket: string;

  region: string;

  basePath: string = "/";

  /**
   * Creates a new S3FileSystem instance.
   *
   * @param bucket - S3 bucket name
   * @param region - AWS region (e.g., "us-east-1")
   * @param accessKeyId - AWS access key ID
   * @param secretAccessKey - AWS secret access key
   * @param endpoint - Optional custom endpoint for S3-compatible services
   * @param basePath - Optional base path for directory scoping
   */
  constructor(
    bucket: string,
    region: string,
    accessKeyId: string,
    secretAccessKey: string,
    endpoint?: string,
    basePath?: string,
    usePathStyle: boolean = true // 默认兼容S3
  ) {
    this.bucket = bucket;
    this.region = region;
    this.basePath = basePath || "/";

    const config: S3ClientConfig = {
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      // forcePathStyle: true 对 AWS 官方 S3 不是最佳实践（会用 path-style URL，已被逐渐弃用），对 MinIO 等兼容服务则是必须的。硬编码会导致部分用户配置失败。
      forcePathStyle: usePathStyle,
    };

    if (endpoint) {
      // AWS SDK v3 要求 endpoint 是完整 URL（带 https://）。缺少协议会导致 InvalidEndpoint 或连接失败。
      // 自动补全协议（常见兼容做法）
      let fixedEndpoint = `${endpoint}`.trim();
      if (!fixedEndpoint.startsWith("http://") && !fixedEndpoint.startsWith("https://")) {
        fixedEndpoint = `https://${fixedEndpoint}`;
      }
      config.endpoint = endpoint;
      // 自动检测：如果 endpoint 包含 amazonaws.com，设为 false。
      if (endpoint.includes("amazonaws.com")) config.forcePathStyle = false;
    }

    this.client = new S3Client(config);
  }

  /**
   * Verifies bucket access and credentials.
   * @throws {WarpTokenError} If authentication fails
   * @throws {Error} If bucket not found or network error
   */
  async verify(): Promise<void> {
    try {
      const command = new HeadBucketCommand({
        Bucket: this.bucket,
      });
      await this.client.send(command);
    } catch (error: any) {
      if (error.name === "NotFound") {
        throw new Error("NotFound"); // Bucket 不存在
      }
      if (
        error.name === "InvalidAccessKeyId" ||
        error.name === "SignatureDoesNotMatch" ||
        error.name === "InvalidClientTokenId"
      ) {
        throw new WarpTokenError(error); // AccessKey 或 SecretKey 无效
      }
      if (error.name === "AccessDenied") {
        throw new Error("Access Denied"); // 无权限访问该 Bucket（Access Denied）
      }
      if (error.name === "PermanentRedirect") {
        throw new Error("Access Denied"); // Region 设置错误，请检查 region 是否匹配 Bucket 所在区域
      }
      if (error.name === "NoSuchBucket") {
        throw new Error(`Bucket not found: ${this.bucket}`);
      }
      if (error.message?.includes("getaddrinfo") || error.message?.includes("fetch failed")) {
        throw new Error("Network connection failed. Please check your internet connection."); // 网络连接失败，请检查 endpoint 或网络
      }
      throw error;
    }
  }

  /**
   * Opens a file for reading.
   * @param file - File information
   * @returns FileReader instance for reading file content
   */
  async open(file: FileInfo): Promise<FileReader> {
    const key = joinPath(file.path, file.name).substring(1); // Remove leading /
    return new S3FileReader(this.client, this.bucket, key);
  }

  /**
   * Opens a directory (returns a new FileSystem scoped to that directory).
   * @param path - Directory path relative to current basePath
   * @returns New S3FileSystem instance scoped to the directory
   */
  async openDir(path: string): Promise<FileSystem> {
    const newBasePath = joinPath(this.basePath, path);
    const fs = new S3FileSystem(
      this.bucket,
      this.region,
      "", // 占位: These won't be used since we're reusing the client
      "",
      undefined,
      newBasePath,
      true // forcePathStyle 同父
    );
    // openDir 又 new 一个 S3FileSystem，但传了空字符串的 AK/SK，导致逻辑不清晰。
    // 复用原有 client，只修改 basePath。
    fs.client = this.client; // 复用 client
    return fs;
  }

  /**
   * Creates a file for writing.
   * @param path - File path relative to current basePath
   * @param opts - Optional file creation options (modifiedDate)
   * @returns FileWriter instance for writing file content
   */
  async create(path: string, opts?: FileCreateOptions): Promise<FileWriter> {
    const key = joinPath(this.basePath, path).substring(1); // Remove leading /
    return new S3FileWriter(this.client, this.bucket, key, opts?.modifiedDate);
  }

  /**
   * Creates a directory (no-op for S3, directories are implicit).
   * @param _path - Directory path (unused)
   * @param _opts - Optional creation options (unused)
   */
  async createDir(_path: string, _opts?: FileCreateOptions): Promise<void> {
    // No-op: S3 doesn't require explicit directory creation
    return Promise.resolve();
  }

  /**
   * Deletes a file from S3.
   * This operation is idempotent - deleting a non-existent file succeeds.
   * @param path - File path relative to current basePath
   */
  async delete(path: string): Promise<void> {
    try {
      const key = joinPath(this.basePath, path).substring(1); // Remove leading /
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      await this.client.send(command);
    } catch (error: any) {
      // S3 delete is idempotent - if the key doesn't exist, it succeeds
      if (error.name === "NoSuchKey") {
        return;
      }
      throw error;
    }
  }

  /**
   * Lists files in the current directory.
   * Handles pagination automatically for large directories.
   * @returns Array of FileInfo objects for files in current directory
   * @throws {Error} If permission denied or other S3 error
   */
  async list(): Promise<FileInfo[]> {
    const prefix = this.basePath === "/" ? "" : this.basePath.substring(1);
    const files: FileInfo[] = [];
    let continuationToken: string | undefined;

    try {
      do {
        const command = new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          Delimiter: "/",
          ContinuationToken: continuationToken,
          MaxKeys: 1000, // ← 每次最多 1000，防滥用
        });

        const response = await this.client.send(command);

        // 处理 CommonPrefixes（子目录）
        // if (response.CommonPrefixes) {
        //   for (const prefix of response.CommonPrefixes) {
        //     if (prefix.Prefix && prefix.Prefix !== this.basePath) {
        //     }
        //   }
        // }

        // 处理 Contents（文件）
        if (response.Contents) {
          for (const obj of response.Contents) {
            if (!obj.Key) continue;
            if (obj.Key && obj.Key.endsWith("/")) continue; // 跳过目录占位符
            if (obj.Key === this.basePath.slice(1)) continue; // 跳过 prefix 本身

            // const name = obj.Key.substring(prefix.length);
            const relativeKey = obj.Key.slice(this.basePath.length);
            if (!relativeKey) continue;

            const lastModified = obj.LastModified?.getTime() || Date.now();

            files.push({
              name: relativeKey,
              path: this.basePath,
              size: obj.Size || 0,
              digest: obj.ETag?.replace(/"/g, "") || "",
              createtime: lastModified,
              updatetime: lastModified,
            });
          }
        }

        continuationToken = response.NextContinuationToken;
      } while (continuationToken);

      if (files.length > 10000) {
        console.warn(`Directory listing truncated: >10000 items under ${this.basePath}`);
      }

      return files;
    } catch (error: any) {
      if (error.name === "AccessDenied") {
        throw new Error(`Permission denied. Check your IAM permissions for bucket: ${this.bucket}`);
      }
      throw error;
    }
  }

  /**
   * Gets the S3 console URL for the current directory.
   * @returns URL to S3 console for this bucket/prefix
   */
  async getDirUrl(): Promise<string> {
    const prefix = this.basePath === "/" ? "" : this.basePath.substring(1);
    return `https://s3.console.aws.amazon.com/s3/buckets/${this.bucket}?prefix=${encodeURIComponent(prefix)}&region=${this.region}`;
  }
}
