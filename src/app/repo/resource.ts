import axios from "axios";
import crypto from "crypto-js";
import { blobToBase64 } from "@App/utils/script";
import Cache from "@App/app/cache";
import LoggerCore from "@App/app/logger/core";
import Logger from "../logger/logger";
import { DAO, db } from "./dao";
import { ResourceLinkDAO } from "./resource_link";

export type ResourceType = "require" | "require-css" | "resource";

export interface Resource {
  id: number;
  url: string;
  content: string;
  base64: string;
  hash: ResourceHash;
  type?: ResourceType;
  contentType: string;
  createtime?: number;
  updatetime?: number;
}

export interface ResourceHash {
  md5: string;
  sha1: string;
  sha256: string;
  sha384: string;
  sha512: string;
}

function calculateHash(blob: Blob): Promise<ResourceHash> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsBinaryString(blob);
    reader.onloadend = () => {
      if (!reader.result) {
        resolve({
          md5: "",
          sha1: "",
          sha256: "",
          sha384: "",
          sha512: "",
        });
      } else {
        resolve({
          md5: crypto.MD5(<string>reader.result).toString(),
          sha1: crypto.SHA1(<string>reader.result).toString(),
          sha256: crypto.SHA256(<string>reader.result).toString(),
          sha384: crypto.SHA384(<string>reader.result).toString(),
          sha512: crypto.SHA512(<string>reader.result).toString(),
        });
      }
    };
  });
}

export const ErrResourceNotFound = new Error("资源未找到");
export const ErrResourceLoadFailed = new Error("资源加载失败");

export class ResourceDAO extends DAO<Resource> {
  public tableName = "resource";

  private logger: Logger;

  private resourceLinkDAO: ResourceLinkDAO;

  constructor() {
    super();
    this.table = db.table(this.tableName);
    this.resourceLinkDAO = new ResourceLinkDAO();
    this.logger = LoggerCore.getInstance().logger({ DAO: "resource" });
  }

  public async addResource(url: string, scriptId: number): Promise<Resource> {
    const u = ResourceDAO.parseUrl(url);
    let result = await this.getResource(u.url);
    // 资源不存在,重新加载
    if (!result) {
      try {
        const resource = await ResourceDAO.loadByUrl(u.url);
        resource.createtime = new Date().getTime();
        resource.updatetime = new Date().getTime();
        Cache.getInstance().set(`resource:${u.url}`, resource);
        const id = await this.save(resource);
        result = resource;
        this.logger.info("load resource success", { url: u.url, id });
      } catch (e) {
        this.logger.error("load resource error", { url: u.url }, Logger.E(e));
        throw e;
      }
    }

    const link = await this.resourceLinkDAO.findOne({
      url: u.url,
      scriptId,
    });
    if (link) {
      return Promise.resolve(result);
    }
    const id = await this.resourceLinkDAO.save({
      id: 0,
      url: u.url,
      scriptId,
      createtime: new Date().getTime(),
    });
    this.logger.debug("resource link", {
      url: u.url,
      resourceID: result.id,
      id,
    });
    return Promise.resolve(result);
  }

  async getResource(url: string) {
    const u = ResourceDAO.parseUrl(url);
    const resource = await this.findOne({ url: u.url });
    if (resource) {
      // 校验hash
      if (u.hash) {
        if (
          (u.hash.md5 && u.hash.md5 !== resource.hash.md5) ||
          (u.hash.sha1 && u.hash.sha1 !== resource.hash.sha1) ||
          (u.hash.sha256 && u.hash.sha256 !== resource.hash.sha256) ||
          (u.hash.sha384 && u.hash.sha384 !== resource.hash.sha384) ||
          (u.hash.sha512 && u.hash.sha512 !== resource.hash.sha512)
        ) {
          resource.content = `console.warn("ScriptCat: couldn't load resource from URL ${url} due to a SRI error ");`;
        }
      }
      return Promise.resolve(resource);
    }
    return Promise.resolve(undefined);
  }

  // 方便识别text文本储存
  static textContentTypeMap = new Map<string, boolean>()
    .set("application/javascript", true)
    .set("application/x-javascript", true)
    .set("application/json", true);

  static loadByUrl(url: string): Promise<Resource> {
    return new Promise((resolve, reject) => {
      const u = ResourceDAO.parseUrl(url);
      axios
        .get(u.url, {
          responseType: "blob",
        })
        .then(async (response) => {
          if (response.status !== 200) {
            return reject(new Error(`资源状态非200:${response.status}`));
          }
          const resource: Resource = {
            id: 0,
            url: u.url,
            content: "",
            contentType: (
              response.headers["content-type"] || "application/octet-stream"
            ).split(";")[0],
            hash: await calculateHash(<Blob>response.data),
            base64: "",
          };
          if (
            resource.contentType.startsWith("text/") ||
            ResourceDAO.textContentTypeMap.has(resource.contentType)
          ) {
            resource.content = await (<Blob>response.data).text();
          } else {
            return reject(
              new Error(`不允许的资源类型:${resource.contentType}`)
            );
          }
          resource.base64 = (await blobToBase64(<Blob>response.data)) || "";
          return resolve(resource);
        });
    });
  }

  static parseUrl(url: string): {
    url: string;
    hash?: { [key: string]: string };
  } {
    const urls = url.split("#");
    if (urls.length < 2) {
      return { url: urls[0], hash: undefined };
    }
    const hashs = urls[1].split(/[,;]/);
    const hash: { [key: string]: string } = {};
    hashs.forEach((val) => {
      const kv = val.split("=");
      if (kv.length < 2) {
        return;
      }
      hash[kv[0]] = kv[1].toLocaleLowerCase();
    });
    return { url: urls[0], hash };
  }
}
