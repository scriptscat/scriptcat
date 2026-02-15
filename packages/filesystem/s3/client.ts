/**
 * 轻量级 Amazon S3 HTTP 客户端
 * 使用 AWS Signature V4 签名，通过原生 fetch 发送请求
 * 不依赖 @aws-sdk/client-s3
 */

import { XMLParser } from "fast-xml-parser";

export interface S3ClientConfig {
  region: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  endpoint?: string;
  /** 强制路径式访问（默认 true，兼容 MinIO 等） */
  forcePathStyle?: boolean;
}

// ---- 加密工具函数 (使用 Web Crypto API) ----

async function sha256(data: string | Uint8Array): Promise<ArrayBuffer> {
  const encoded = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return crypto.subtle.digest("SHA-256", encoded.buffer as ArrayBuffer);
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(data: string | Uint8Array): Promise<string> {
  return toHex(await sha256(data));
}

async function hmacSha256(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const encoded = new TextEncoder().encode(data);
  return crypto.subtle.sign("HMAC", cryptoKey, encoded.buffer as ArrayBuffer);
}

/** 派生 AWS Signature V4 签名密钥 */
async function deriveSigningKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string
): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(new TextEncoder().encode(`AWS4${secretKey}`).buffer as ArrayBuffer, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

// ---- URI 编码 ----

/** AWS Signature V4 要求的 URI 编码，仅保留 A-Za-z0-9_-.~ 不编码 */
function awsUriEncode(str: string, encodeSlash: boolean = true): string {
  let result = "";
  const bytes = new TextEncoder().encode(str);
  for (const b of bytes) {
    const ch = String.fromCharCode(b);
    if (
      (ch >= "A" && ch <= "Z") ||
      (ch >= "a" && ch <= "z") ||
      (ch >= "0" && ch <= "9") ||
      ch === "_" ||
      ch === "-" ||
      ch === "~" ||
      ch === "."
    ) {
      result += ch;
    } else if (ch === "/" && !encodeSlash) {
      result += ch;
    } else {
      result += `%${b.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return result;
}

// ---- S3 错误处理 ----

/** S3 服务端返回的错误 */
export class S3Error extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = code; // 兼容原 SDK 行为 (error.name === "NotFound" 等)
    this.code = code;
    this.statusCode = statusCode;
  }
}

/** 从 S3 响应解析错误信息 */
async function parseS3Error(response: Response): Promise<S3Error> {
  // 状态码到错误名称的映射（用于 HEAD 等无响应体的请求）
  const statusCodeMap: Record<number, string> = {
    301: "PermanentRedirect",
    400: "BadRequest",
    403: "AccessDenied",
    404: "NotFound",
    409: "Conflict",
  };

  try {
    const text = await response.text();
    if (text) {
      const parser = new XMLParser();
      const parsed = parser.parse(text);
      const error = parsed.Error;
      if (error?.Code) {
        return new S3Error(String(error.Code), String(error.Message || response.statusText), response.status);
      }
    }
  } catch {
    // 解析失败则使用状态码映射
  }

  const code = statusCodeMap[response.status] || `HTTP${response.status}`;
  return new S3Error(code, response.statusText, response.status);
}

// ---- S3 客户端 ----

export class S3Client {
  private config: Required<Pick<S3ClientConfig, "region" | "credentials" | "forcePathStyle">>;
  private parsedEndpoint: URL;
  private customEndpoint: boolean;

  constructor(config: S3ClientConfig) {
    this.config = {
      region: config.region || "us-east-1",
      credentials: config.credentials,
      forcePathStyle: config.forcePathStyle ?? true,
    };
    this.customEndpoint = !!config.endpoint;

    let endpoint: string;
    if (config.endpoint) {
      endpoint = config.endpoint.trim();
      if (!endpoint.startsWith("http://") && !endpoint.startsWith("https://")) {
        endpoint = `https://${endpoint}`;
      }
    } else {
      endpoint = `https://s3.${this.config.region}.amazonaws.com`;
    }
    // 去除尾部斜杠
    endpoint = endpoint.replace(/\/+$/, "");
    this.parsedEndpoint = new URL(endpoint);
  }

  /** 获取请求的 Host */
  private getHost(bucket: string): string {
    const { hostname, port } = this.parsedEndpoint;
    const hostWithPort = port ? `${hostname}:${port}` : hostname;
    if (this.config.forcePathStyle) {
      return hostWithPort;
    }
    return `${bucket}.${hostWithPort}`;
  }

  /** 获取签名用的 Canonical URI */
  private getCanonicalUri(bucket: string, key?: string): string {
    if (this.config.forcePathStyle) {
      let uri = `/${awsUriEncode(bucket)}`;
      if (key) uri += `/${awsUriEncode(key, false)}`;
      return uri;
    }
    if (key) return `/${awsUriEncode(key, false)}`;
    return "/";
  }

  /** 构建请求 URL */
  private buildUrl(bucket: string, key?: string, queryParams?: Record<string, string>): string {
    const proto = this.parsedEndpoint.protocol;
    const host = this.getHost(bucket);
    let path: string;
    if (this.config.forcePathStyle) {
      path = `/${bucket}`;
      if (key) path += `/${awsUriEncode(key, false)}`;
    } else {
      path = key ? `/${awsUriEncode(key, false)}` : "/";
    }

    let url = `${proto}//${host}${path}`;
    if (queryParams && Object.keys(queryParams).length > 0) {
      const qs = Object.entries(queryParams)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${awsUriEncode(k)}=${awsUriEncode(v)}`)
        .join("&");
      url += `?${qs}`;
    }
    return url;
  }

  /** AWS Signature V4 签名 */
  private async signRequest(
    method: string,
    bucket: string,
    key: string | undefined,
    queryParams: Record<string, string>,
    headers: Record<string, string>,
    payloadHash: string
  ): Promise<void> {
    const now = new Date();
    // ISO 8601 基本格式: 20210101T000000Z
    const amzDate = now
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
    const dateStamp = amzDate.substring(0, 8);

    headers["host"] = this.getHost(bucket);
    headers["x-amz-date"] = amzDate;
    headers["x-amz-content-sha256"] = payloadHash;

    // 构建 Canonical Request
    const canonicalUri = this.getCanonicalUri(bucket, key);
    const canonicalQueryString = Object.entries(queryParams)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${awsUriEncode(k)}=${awsUriEncode(v)}`)
      .join("&");

    const signedHeaderKeys = Object.keys(headers)
      .map((k) => k.toLowerCase())
      .sort();
    const canonicalHeaders = signedHeaderKeys.map((k) => `${k}:${(headers[k] ?? "").trim()}\n`).join("");
    const signedHeaders = signedHeaderKeys.join(";");

    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");

    // 构建 String to Sign
    const credentialScope = `${dateStamp}/${this.config.region}/s3/aws4_request`;
    const canonicalRequestHash = await sha256Hex(canonicalRequest);
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, canonicalRequestHash].join("\n");

    // 计算签名
    const signingKey = await deriveSigningKey(
      this.config.credentials.secretAccessKey,
      dateStamp,
      this.config.region,
      "s3"
    );
    const signature = toHex(await hmacSha256(signingKey, stringToSign));

    // 添加 Authorization 头
    headers["authorization"] =
      `AWS4-HMAC-SHA256 Credential=${this.config.credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  }

  /**
   * 发送 S3 请求
   * @param method HTTP 方法
   * @param bucket Bucket 名称
   * @param key 对象 Key（可选）
   * @param options 请求选项
   * @returns 成功时返回 Response
   * @throws {S3Error} S3 服务端错误
   */
  async request(
    method: string,
    bucket: string,
    key?: string,
    options?: {
      queryParams?: Record<string, string>;
      body?: string | Uint8Array;
      headers?: Record<string, string>;
    }
  ): Promise<Response> {
    const queryParams = options?.queryParams || {};
    // 规范化 headers（全部小写 key）
    const headers: Record<string, string> = {};
    if (options?.headers) {
      for (const [k, v] of Object.entries(options.headers)) {
        headers[k.toLowerCase()] = v;
      }
    }

    // 计算 payload SHA-256
    let payloadHash: string;
    if (options?.body) {
      const bodyBytes = typeof options.body === "string" ? new TextEncoder().encode(options.body) : options.body;
      payloadHash = await sha256Hex(bodyBytes);
    } else {
      payloadHash = await sha256Hex("");
    }

    // 签名
    await this.signRequest(method, bucket, key, queryParams, headers, payloadHash);

    // 发送请求（移除 host 头，fetch 会自动设置）
    const url = this.buildUrl(bucket, key, queryParams);
    const fetchHeaders = { ...headers };
    delete fetchHeaders["host"];

    const response = await fetch(url, {
      method,
      headers: fetchHeaders,
      body: options?.body
        ? options.body instanceof Uint8Array
          ? (options.body.buffer as ArrayBuffer)
          : options.body
        : undefined,
    });

    // 非 2xx 响应视为错误
    if (!response.ok) {
      throw await parseS3Error(response);
    }

    return response;
  }

  /** 获取 endpoint URL */
  getEndpointUrl(): string {
    return this.parsedEndpoint.origin;
  }

  /** 是否使用了自定义 endpoint */
  hasCustomEndpoint(): boolean {
    return this.customEndpoint;
  }

  /** 获取 region */
  getRegion(): string {
    return this.config.region;
  }

  /** 获取 forcePathStyle */
  isForcePathStyle(): boolean {
    return this.config.forcePathStyle;
  }
}
