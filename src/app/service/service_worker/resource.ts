import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import type { Resource, ResourceHash, ResourceType } from "@App/app/repo/resource";
import { ResourceDAO } from "@App/app/repo/resource";
import type { Script } from "@App/app/repo/scripts";
import { type IMessageQueue } from "@Packages/message/message_queue";
import { type Group } from "@Packages/message/server";
import type { ResourceBackup } from "@App/pkg/backup/struct";
import { isText } from "@App/pkg/utils/istextorbinary";
import { blobToBase64, randNum } from "@App/pkg/utils/utils";
import { type TDeleteScript } from "../queue";
import { calculateHashFromArrayBuffer } from "@App/pkg/utils/crypto";
import { isBase64, parseUrlSRI } from "./utils";
import { stackAsyncTask } from "@App/pkg/utils/async_queue";
import { blobToUint8Array } from "@App/pkg/utils/datatype";
import { readBlobContent } from "@App/pkg/utils/encoding";

export class ResourceService {
  logger: Logger;
  resourceDAO: ResourceDAO = new ResourceDAO();

  constructor(
    private group: Group,
    private mq: IMessageQueue
  ) {
    this.logger = LoggerCore.logger().with({ service: "resource" });
    this.resourceDAO.enableCache();
  }

  public async getResource(
    uuid: string,
    url: string,
    type: ResourceType,
    loadNow: boolean
  ): Promise<Resource | undefined> {
    const res = await this.getResourceModel(url);
    if (res) {
      // 读取过但失败的资源加载也会被放在缓存，避免再加载资源
      // 因此 getResource 时不会再加载资源，直接返回 undefined 表示没有资源
      if (!res.contentType) return undefined;
      return res;
    }
    // 缓存中无资源加载纪录
    if (loadNow) {
      // 立即尝试加载资源
      try {
        return await this.updateResource(uuid, url, type);
      } catch (e: any) {
        this.logger.error("load resource error", { url }, Logger.E(e));
      }
    } else {
      // 等一下尝试加载资源 （在后台异步加载）
      // 先返回 undefined 表示没有资源
      // 避免所有资源立即同一时间加载, delay设为 1.2s ~ 2.4s
      setTimeout(
        () => {
          this.updateResource(uuid, url, type);
        },
        randNum(1200, 2400)
      );
    }
    return undefined;
  }

  public async getScriptResources(script: Script, load: boolean): Promise<{ [key: string]: Resource }> {
    const [require, require_css, resource] = await Promise.all([
      this.getResourceByType(script, "require", load),
      this.getResourceByType(script, "require-css", load),
      this.getResourceByType(script, "resource", load),
    ]);

    return {
      ...require,
      ...require_css,
      ...resource,
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
          if (uri.startsWith("file:///")) {
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

  updateResourceByType(script: Script, type: ResourceType) {
    const promises = script.metadata[type]?.map(async (u) => {
      if (type === "resource") {
        const split = u.split(/\s+/);
        if (split.length === 2) {
          return this.checkResource(script.uuid, split[1], "resource");
        }
      } else {
        return this.checkResource(script.uuid, u, type);
      }
    });
    return promises?.length && Promise.allSettled(promises);
  }

  // 检查资源是否存在,如果不存在则重新加载
  async checkResource(uuid: string, url: string, type: ResourceType) {
    let res = await this.getResourceModel(url);
    const updateTime = res?.updatetime;
    // 判断1天过期
    if (updateTime && updateTime > Date.now() - 1000 * 86400) {
      return res;
    }
    try {
      res = await this.updateResource(uuid, url, type);
      if (res?.contentType) {
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
      const now = Date.now();
      resource.updatetime = now;
      if (!result || !result.contentType) {
        // 资源不存在,保存
        resource.createtime = now;
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
      // 资源错误时保存一个空纪录以防止再度尝试加载
      // this.resourceDAO.save 自身出错的话忽略
      await this.resourceDAO
        .save({
          url: u.url,
          content: "",
          contentType: "",
          hash: {
            md5: "",
            sha1: "",
            sha256: "",
            sha384: "",
            sha512: "",
          },
          base64: "",
          link: { [uuid]: true },
          type,
          createtime: Date.now(),
        })
        .catch(console.warn);
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
      const hash = u.hash;
      if (hash) {
        let flag = true;
        for (const key of Object.keys(hash)) {
          if (isBase64(hash[key])) {
            // 对比base64编码的hash
            const integrity = resource.hash.integrity as Partial<Record<string, string>>;
            if (integrity && integrity[key] !== hash[key]) {
              flag = false;
              break;
            }
          } else {
            // 对比普通的hash
            if (key in resource.hash) {
              if (resource.hash[key as keyof ResourceHash] !== hash[key].toLowerCase()) {
                flag = false;
                break;
              }
            }
          }
        }
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
      blobToUint8Array(data),
      blobToBase64(data),
    ]);
    const contentType = resp.headers.get("content-type");
    const resource: Resource = {
      url: u.url,
      content: "",
      contentType: (contentType || "application/octet-stream").split(";")[0],
      hash: hash,
      base64: "",
      link: {},
      type,
      createtime: Date.now(),
    };
    const uint8Array = new Uint8Array(arrayBuffer);
    if (isText(uint8Array)) {
      resource.content = await readBlobContent(data, contentType);
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
    const now = Date.now();
    const ts = data.meta.ts || 0;
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
        createtime: ts ? Math.min(ts, now) : now,
        updatetime: ts ? Math.min(ts, now) : now,
      };
    } else {
      res.updatetime = now;
    }
    res.link[uuid] = true;
    return await this.resourceDAO.update(data.meta.url, res);
  }

  requestGetScriptResources(script: Script): Promise<{ [key: string]: Resource }> {
    return this.getScriptResources(script, false);
  }

  init() {
    this.group.on("getScriptResources", this.requestGetScriptResources.bind(this));
    this.group.on("deleteResource", this.deleteResource.bind(this));

    // 删除相关资源
    this.mq.subscribe<TDeleteScript[]>("deleteScripts", (data) => {
      // 使用事务当锁，避免并发删除导致数据不一致
      stackAsyncTask<boolean>("resource_lock", async () => {
        for (const { uuid } of data) {
          const resources = await this.resourceDAO.find((key, value) => {
            return value.link[uuid];
          });
          for (const res of resources) {
            // 删除link
            delete res.link[uuid];
          }
          await Promise.all(
            resources.map((res) => {
              if (Object.keys(res.link).length > 0) {
                return this.resourceDAO.update(res.url, res);
              }
              // 如果没有关联脚本了,删除资源
              return this.resourceDAO.delete(res.url);
            })
          );
        }
        return true;
      });
    });
  }
}
