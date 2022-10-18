/* eslint-disable no-await-in-loop */
import IoC from "@App/app/ioc";
import crypto from "crypto-js";
import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { MessageHander } from "@App/app/message/message";
import {
  Resource,
  ResourceDAO,
  ResourceHash,
  ResourceType,
} from "@App/app/repo/resource";
import { ResourceLinkDAO } from "@App/app/repo/resource_link";
import { Script } from "@App/app/repo/scripts";
import axios from "axios";
import Cache from "@App/app/cache";
import { blobToBase64 } from "@App/utils/script";
import CacheKey from "@App/utils/cache_key";
import Manager from "../manager";

// 资源管理器,负责资源的更新获取等操作

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

@IoC.Singleton(MessageHander)
export class ResourceManager extends Manager {
  resourceDAO: ResourceDAO;

  resourceLinkDAO: ResourceLinkDAO;

  logger: Logger;

  constructor(message: MessageHander) {
    super(message);
    this.resourceDAO = new ResourceDAO();
    this.resourceLinkDAO = new ResourceLinkDAO();
    this.logger = LoggerCore.getInstance().logger({
      component: "resource",
    });
  }

  public async getResource(
    id: number,
    url: string,
    type: ResourceType
  ): Promise<Resource | undefined> {
    let res = await this.getResourceModel(url);
    if (res) {
      return Promise.resolve(res);
    }
    try {
      res = await this.addResource(url, id, type);
      if (res) {
        return Promise.resolve(res);
      }
    } catch (e) {
      this.logger.debug("get resource failed", { id, url }, Logger.E(e));
    }
    return Promise.resolve(undefined);
  }

  public async getScriptResources(
    script: Script
  ): Promise<{ [key: string]: Resource }> {
    const ret: { [key: string]: Resource } = {};
    for (let i = 0; i < script.metadata.require?.length; i += 1) {
      const res = await this.getResource(
        script.id,
        script.metadata.require[i],
        "require"
      );
      if (res) {
        ret[script.metadata.require[i]] = res;
      }
    }
    for (let i = 0; i < script.metadata["require-css"]?.length; i += 1) {
      const res = await this.getResource(
        script.id,
        script.metadata["require-css"][i],
        "require-css"
      );
      if (res) {
        ret[script.metadata["require-css"][i]] = res;
      }
    }

    for (let i = 0; i < script.metadata.resource?.length; i += 1) {
      const split = script.metadata.resource[i].split(/\s+/);
      if (split.length === 2) {
        const res = await this.getResource(script.id, split[1], "resource");
        if (res) {
          ret[split[0]] = res;
        }
      }
    }
    return Promise.resolve(ret);
  }

  public async addResource(
    url: string,
    scriptId: number,
    type: ResourceType
  ): Promise<Resource> {
    const u = this.parseUrl(url);
    let result = await this.getResourceModel(u.url);
    // 资源不存在,重新加载
    if (!result) {
      try {
        const resource = await this.loadByUrl(u.url, type);
        resource.createtime = new Date().getTime();
        resource.updatetime = new Date().getTime();
        Cache.getInstance().set(CacheKey.resourceByUrl(u.url), resource);
        const id = await this.resourceDAO.save(resource);
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

  async getResourceModel(url: string) {
    const u = this.parseUrl(url);
    const resource = await this.resourceDAO.findOne({ url: u.url });
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

  loadByUrl(url: string, type: ResourceType): Promise<Resource> {
    return new Promise((resolve, reject) => {
      const u = this.parseUrl(url);
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
            type,
          };
          if (
            resource.contentType.startsWith("text/") ||
            ResourceManager.textContentTypeMap.has(resource.contentType)
          ) {
            resource.content = await (<Blob>response.data).text();
          } else if (resource.type === "resource") {
            // 资源不判断类型
            resource.base64 = (await blobToBase64(<Blob>response.data)) || "";
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

  parseUrl(url: string): {
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

export default ResourceManager;
