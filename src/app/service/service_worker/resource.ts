import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import type { Resource, ResourceHash, ResourceType } from "@App/app/repo/resource";
import { ResourceDAO } from "@App/app/repo/resource";
import type { Script } from "@App/app/repo/scripts";
import { type MessageQueue } from "@Packages/message/message_queue";
import { type Group } from "@Packages/message/server";
import type { ResourceBackup } from "@App/pkg/backup/struct";
import { isText } from "@App/pkg/utils/istextorbinary";
import { blobToBase64 } from "@App/pkg/utils/utils";
import { subscribeScriptDelete } from "../queue";
import Cache from "@App/app/cache";
import { calculateHashFromArrayBuffer } from "@App/pkg/utils/crypto";
import { isBase64, parseUrlSRI } from "./utils";

export class ResourceService {
  logger: Logger;
  resourceDAO: ResourceDAO = new ResourceDAO();

  constructor(
    private group: Group,
    private mq: MessageQueue
  ) {
    this.logger = LoggerCore.logger().with({ service: "resource" });
    this.resourceDAO.enableCache();
  }

  public async getResource(
    uuid: string,
    url: string,
    _type: ResourceType,
    load: boolean
  ): Promise<Resource | undefined> {
    const res = await this.getResourceModel(url);
    if (res) {
      return res;
    }
    if (load) {
      // 如果没有缓存，则尝试加载资源
      try {
        return await this.updateResource(uuid, url, _type);
      } catch (e: any) {
        this.logger.error("load resource error", { url }, Logger.E(e));
      }
    } else {
      // 如果没有缓存则不加载，则返回undefined，但是会在后台异步加载
      this.updateResource(uuid, url, _type);
    }
    return undefined;
  }

  public async getScriptResources(script: Script, load: boolean): Promise<{ [key: string]: Resource }> {
    return {
      ...((await this.getResourceByType(script, "require", load)) || {}),
      ...((await this.getResourceByType(script, "require-css", load)) || {}),
      ...((await this.getResourceByType(script, "resource", load)) || {}),
    };
  }

  async getResourceByType(script: Script, type: ResourceType, load: boolean): Promise<{ [key: string]: Resource }> {
    if (!script.metadata[type]) {
      return {};
    }
    const ret: { [key: string]: Resource } = {};
    await Promise.allSettled(
      script.metadata[type].map(async (uri) => {
        /** 资源键名 */
        let resourceKey = uri;
        /** 文件路径 */
        let path: string | null = uri;
        if (type === "resource") {
          // @resource xxx https://...
          const split = uri.split(/\s+/);
          if (split.length === 2) {
            resourceKey = split[0];
            path = split[1].trim();
          } else {
            path = null;
          }
        }
        if (path) {
          if (uri.startsWith("file://")) {
            // 如果是file://协议，则每次请求更新一下文件
            const res = await this.updateResource(script.uuid, path, type);
            ret[resourceKey] = res;
          } else {
            const res = await this.getResource(script.uuid, path, type, load);
            if (res) {
              ret[resourceKey] = res;
            }
          }
        }
      })
    );
    return ret;
  }

  // 更新资源
  async checkScriptResource(script: Script) {
    return {
      ...((await this.checkResourceByType(script, "require")) || {}),
      ...((await this.checkResourceByType(script, "require-css")) || {}),
      ...((await this.checkResourceByType(script, "resource")) || {}),
    };
  }

  async checkResourceByType(script: Script, type: ResourceType): Promise<{ [key: string]: Resource }> {
    if (!script.metadata[type]) {
      return {};
    }
    const ret: { [key: string]: Resource } = {};
    await Promise.allSettled(
      script.metadata[type].map(async (u) => {
        if (type === "resource") {
          const split = u.split(/\s+/);
          if (split.length === 2) {
            const res = await this.checkResource(script.uuid, split[1], "resource");
            if (res) {
              ret[split[0]] = res;
            }
          }
        } else {
          const res = await this.checkResource(script.uuid, u, type);
          if (res) {
            ret[u] = res;
          }
        }
      })
    );
    return ret;
  }

  // 检查资源是否存在,如果不存在则重新加载
  async checkResource(uuid: string, url: string, type: ResourceType) {
    let res = await this.getResourceModel(url);
    if (res) {
      // 判断1分钟过期
      if ((res.updatetime || 0) > new Date().getTime() - 1000 * 60) {
        return res;
      }
    }
    try {
      res = await this.updateResource(uuid, url, type);
      if (res) {
        return res;
      }
    } catch (e: any) {
      // ignore
      this.logger.error("check resource failed", { uuid, url }, Logger.E(e));
    }
    return undefined;
  }

  async updateResource(uuid: string, url: string, type: ResourceType) {
    // 重新加载
    const u = parseUrlSRI(url);
    let result = await this.getResourceModel(u.url);
    try {
      const resource = await this.loadByUrl(u.url, type);
      resource.updatetime = new Date().getTime();
      if (!result) {
        // 资源不存在,保存
        resource.createtime = new Date().getTime();
        resource.link = { [uuid]: true };
        await this.resourceDAO.save(resource);
        result = resource;
        this.logger.info("reload new resource success", { url: u.url });
      } else {
        result.base64 = resource.base64;
        result.content = resource.content;
        result.contentType = resource.contentType;
        result.hash = resource.hash;
        result.updatetime = resource.updatetime;
        result.link[uuid] = true;
        await this.resourceDAO.update(result.url, result);
        this.logger.info("reload resource success", {
          url: u.url,
        });
      }
    } catch (e) {
      this.logger.error("load resource error", { url: u.url }, Logger.E(e));
      throw e;
    }
    return result;
  }

  async getResourceModel(url: string) {
    const u = parseUrlSRI(url);
    const resource = await this.resourceDAO.get(u.url);
    if (resource) {
      // 校验hash
      if (u.hash) {
        let flag = true;
        console.log("check resource hash", u.hash, resource.hash);
        Object.keys(u.hash).forEach((key) => {
          if (isBase64(u.hash![key])) {
            // 对比base64编码的hash
            if ((resource.hash as any).integrity && (resource.hash as any).integrity[key] !== u.hash![key]) {
              flag = false;
            }
          } else {
            // 对比普通的hash
            if (key in resource.hash) {
              if (resource.hash[key as keyof ResourceHash] !== u.hash![key].toLowerCase()) {
                flag = false;
              }
            }
          }
        });
        if (!flag) {
          resource.content = `console.warn("ScriptCat: couldn't load resource from URL ${url} due to a SRI error ");`;
        }
      }
      return resource;
    }
    return undefined;
  }

  calculateHash(blob: Blob): Promise<ResourceHash> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsArrayBuffer(blob);
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
          resolve(calculateHashFromArrayBuffer(<ArrayBuffer>reader.result));
        }
      };
    });
  }

  async loadByUrl(url: string, type: ResourceType): Promise<Resource> {
    const u = parseUrlSRI(url);
    const resp = await fetch(u.url);
    if (resp.status !== 200) {
      throw new Error(`resource response status not 200: ${resp.status}`);
    }
    const data = await resp.blob();
    const [hash, arrayBuffer, base64] = await Promise.all([
      this.calculateHash(data),
      data.arrayBuffer(),
      blobToBase64(data),
    ]);
    const resource: Resource = {
      url: u.url,
      content: "",
      contentType: (resp.headers.get("content-type") || "application/octet-stream").split(";")[0],
      hash: hash,
      base64: "",
      link: {},
      type,
      createtime: new Date().getTime(),
    };
    const uint8Array = new Uint8Array(arrayBuffer);
    if (isText(uint8Array)) {
      resource.content = await data.text();
    }
    resource.base64 = base64 || "";
    return resource;
  }

  async deleteResource(url: string) {
    // 删除缓存
    const res = await this.resourceDAO.get(url);
    if (!res) {
      throw new Error("resource not found");
    }
    return this.resourceDAO.delete(url);
  }

  async importResource(uuid: string, data: ResourceBackup, type: ResourceType) {
    // 导入资源
    if (!data.source) {
      return undefined;
    }
    const time = new Date().getTime();
    let res = await this.resourceDAO.get(data.meta.url);
    if (!res) {
      // 新增资源
      const blob = new Blob([data.source!]);
      const [hash, base64] = await Promise.all([this.calculateHash(blob), blobToBase64(blob)]);
      res = {
        url: data.meta.url,
        content: data.source!,
        contentType: data.meta.mimetype || "",
        hash,
        base64,
        link: {},
        type,
        createtime: time,
        updatetime: time,
      };
    }
    res.link[uuid] = true;
    res.updatetime = time;
    return await this.resourceDAO.update(data.meta.url, res);
  }

  requestGetScriptResources(script: Script): Promise<{ [key: string]: Resource }> {
    return this.getScriptResources(script, false);
  }

  init() {
    this.group.on("getScriptResources", this.requestGetScriptResources.bind(this));
    this.group.on("deleteResource", this.deleteResource.bind(this));

    // 删除相关资源
    subscribeScriptDelete(this.mq, (data) => {
      // 使用事务当锁，避免并发删除导致数据不一致
      Cache.getInstance().tx("resource_lock", async (_start) => {
        const resources = await this.resourceDAO.find((key, value) => {
          return value.link[data.uuid];
        });
        resources.forEach((res) => {
          // 删除link
          delete res.link[data.uuid];
        });
        await Promise.all(
          resources.map((res) => {
            if (Object.keys(res.link).length > 0) {
              return this.resourceDAO.update(res.url, res);
            }
            // 如果没有关联脚本了,删除资源
            return this.resourceDAO.delete(res.url);
          })
        );
        return true;
      });
    });
  }
}
