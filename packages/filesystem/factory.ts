import BaiduFileSystem from "./baidu/baidu";
import type FileSystem from "./filesystem";
import GoogleDriveFileSystem from "./googledrive/googledrive";
import OneDriveFileSystem from "./onedrive/onedrive";
import DropboxFileSystem from "./dropbox/dropbox";
import WebDAVFileSystem from "./webdav/webdav";
import ZipFileSystem from "./zip/zip";
import S3FileSystem from "./s3/s3";
import { t } from "@App/locales/locales";
import LimiterFileSystem from "./limiter";
import type { WebDAVClientOptions, OAuthToken } from "webdav";

export type FileSystemType = "zip" | "webdav" | "baidu-netdsik" | "onedrive" | "googledrive" | "dropbox" | "s3";

export type FileSystemParams = {
  [key: string]: {
    title: string;
    type?: "select" | "authorize" | "password";
    options?: string[];
    visibilityFor?: string[];
    minWidth?: string;
  };
};

export default class FileSystemFactory {
  static create(type: FileSystemType, params: any): Promise<FileSystem> {
    let fs: FileSystem;
    let options;
    switch (type) {
      case "zip":
        fs = new ZipFileSystem(params);
        break;
      case "webdav":
        /*
          Auto = "auto",
          Digest = "digest", // 需要避免密码直接传输
          None = "none", // 公开资源 / 自定义认证
          Password = "password", // 普通 WebDAV 服务，需要确保 HTTPS / Nextcloud 生产环境
          Token = "token" // OAuth2 / 现代云服务 / Nextcloud 生产环境
        */
        if (params.authType === "none") {
          options = {
            authType: params.authType,
          } satisfies WebDAVClientOptions;
        } else if (params.authType === "token") {
          options = {
            authType: params.authType,
            token: {
              token_type: "Bearer",
              access_token: params.accessToken,
            } satisfies OAuthToken,
          } satisfies WebDAVClientOptions;
        } else {
          options = {
            authType: params.authType || "auto", // UI 问题，有undefined机会。undefined等价于 password, 但此处用 webdav 本身的 auto 侦测算了
            username: params.username,
            password: params.password,
          } satisfies WebDAVClientOptions;
        }
        fs = WebDAVFileSystem.fromCredentials(params.url, options);
        break;
      case "baidu-netdsik":
        fs = new BaiduFileSystem();
        break;
      case "onedrive":
        fs = new OneDriveFileSystem();
        break;
      case "googledrive":
        fs = new GoogleDriveFileSystem();
        break;
      case "dropbox":
        fs = new DropboxFileSystem();
        break;
      case "s3":
        fs = new S3FileSystem(
          params.bucket,
          params.region,
          params.accessKeyId,
          params.secretAccessKey,
          params.endpoint
        );
        break;
      default:
        throw new Error("not found filesystem");
    }
    const limitedFs = new LimiterFileSystem(fs);
    return limitedFs.verify().then(() => limitedFs);
  }

  static params(): { [key: string]: FileSystemParams } {
    return {
      webdav: {
        authType: {
          title: t("auth_type"),
          type: "select",
          options: ["password", "digest", "none", "token"],
          minWidth: "140px",
        },
        url: { title: t("url") },
        username: { title: t("username"), visibilityFor: ["password", "digest"] },
        password: { title: t("password"), type: "password", visibilityFor: ["password", "digest"] },
        accessToken: { title: t("access_token_bearer"), visibilityFor: ["token"] },
      },
      "baidu-netdsik": {},
      onedrive: {},
      googledrive: {},
      dropbox: {},
      s3: {
        bucket: { title: t("s3_bucket_name") },
        region: { title: t("s3_region") },
        accessKeyId: { title: t("s3_access_key_id") },
        secretAccessKey: { title: t("s3_secret_access_key"), type: "password" },
        endpoint: { title: t("s3_custom_endpoint") },
      },
    };
  }

  static async mkdirAll(fs: FileSystem, path: string) {
    return new Promise<void>((resolve, reject) => {
      const dirs = path.split("/");
      let i = 0;
      const mkdir = () => {
        if (i >= dirs.length) {
          resolve();
          return;
        }
        const dir = dirs.slice(0, i + 1).join("/");
        fs.createDir(dir)
          .then(() => {
            i += 1;
            mkdir();
          })
          .catch(() => {
            reject();
          });
      };
      mkdir();
    });
  }
}
