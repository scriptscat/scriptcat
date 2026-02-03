import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import type { Resource, ResourceHash, ResourceType } from "@App/app/repo/resource";
import { ResourceDAO } from "@App/app/repo/resource";
import type { Script } from "@App/app/repo/scripts";
import { type IMessageQueue } from "@Packages/message/message_queue";
import { type Group } from "@Packages/message/server";
import type { ResourceBackup } from "@App/pkg/backup/struct";
import { isText } from "@App/pkg/utils/istextorbinary";
import { blobToBase64, randNum, sleep } from "@App/pkg/utils/utils";
import { type TDeleteScript } from "../queue";
import { calculateHashFromArrayBuffer } from "@App/pkg/utils/crypto";
import { isBase64, parseUrlSRI, type TUrlSRIInfo } from "./utils";
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
    u: TUrlSRIInfo,
    type: ResourceType,
    loadNow: boolean,
    oldResources: Resource | undefined
  ): Promise<Resource | undefined> {
    if (oldResources) {
      // 读取过但失败的资源加载也会被放在缓存，避免再加载资源
      // 因此 getResource 时不会再加载资源，直接返回 undefined 表示没有资源
      if (!oldResources.contentType) return undefined;
      return oldResources;
    }
    // 缓存中无资源加载纪录，需要取得资源
    const url = u.originalUrl;
    if (!loadNow) {
      // 等一下尝试加载资源（例入 import）
      // 避免所有资源立即同一时间加载, delay设为 1.2s ~ 2.4s
      const delay = randNum(1200, 2400);
      await sleep(delay);
      const updatedResource = await this.getResourceModel(u);
      // 如果等候期间有其他程序已生成 resource, 则不用呼叫 updateResource
      if (updatedResource?.contentType) return updatedResource;
    }
    try {
      return await this.updateResource(uuid, u, type, undefined);
    } catch (e: any) {
      this.logger.error("load resource error", { url }, Logger.E(e));
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
          const u = parseUrlSRI(path);
          const oldResources = await this.getResourceModel(u);
          if (uri.startsWith("file:///")) {
            // 如果是file://协议，则每次请求更新一下文件
            const res = await this.updateResource(script.uuid, u, type, oldResources);
            ret[resourceKey] = res;
          } else {
            const res = await this.getResource(script.uuid, u, type, load, oldResources);
            if (res) {
              ret[resourceKey] = res;
            }
          }
        }
      })
    );
    return ret;
  }

  // 只需要等待Promise返回，不理会返回值（失败也可以）
  updateResourceByType(script: Script, type: ResourceType): Promise<any> | void {
    const uuid = script.uuid;
    const promises = script.metadata[type]?.map(async (u) => {
      let url = "";
      if (type === "resource") {
        const split = u.split(/\s+/);
        if (split.length === 2) {
          url = split[1];
        }
      } else {
        url = u;
      }
      if (url) {
        // 检查资源是否存在,如果不存在则重新加载
        // 如果有旧资源，而没有新资讯，则继续使用旧资源
        // 只需要等待Promise返回，不理会返回值（失败也可以）
        const u = parseUrlSRI(url);
        const oldResources = await this.getResourceModel(u);
        const updateTime = oldResources?.updatetime;
        // 资源最后更新是24小时内则不更新
        if (updateTime && updateTime > Date.now() - 86400_000) return;
        // 旧资源或没有资源记录，尝试更新
        try {
          await this.updateResource(uuid, u, type, oldResources);
        } catch (e: any) {
          this.logger.error("check resource failed", { uuid, url }, Logger.E(e));
        }
      }
    });
    if (promises?.length) return Promise.allSettled(promises);
  }

  async updateResource(
    uuid: string,
    u: TUrlSRIInfo,
    type: ResourceType,
    oldResources: Resource | null | undefined = null
  ) {
    // 重新加载
    if (oldResources === null) oldResources = await this.getResourceModel(u);
    let result: Resource;
    try {
      const resource = await this.loadByUrl(u.url, type);
      const now = Date.now();
      resource.updatetime = now;
      if (!oldResources || !oldResources.contentType) {
        // 资源不存在,保存
        resource.createtime = now;
        resource.link = { [uuid]: true };
        await this.resourceDAO.save(resource);
        result = resource;
        this.logger.info("reload new resource success", { url: u.url });
      } else {
        result = {
          ...oldResources,
          base64: resource.base64,
          content: resource.content,
          contentType: resource.contentType,
          hash: resource.hash,
          updatetime: resource.updatetime,
          link: { ...oldResources.link, [uuid]: true },
        };
        await this.resourceDAO.update(result.url, result);
        this.logger.info("reload resource success", {
          url: u.url,
        });
      }
      return result;
    } catch (e) {
      // 如果有旧资源，则使用旧资源
      if (oldResources) {
        this.logger.error("load resource error - fallback to old resource", { url: u.url }, Logger.E(e));
        return oldResources;
      }
      // 资源错误时（且没有旧资源）保存一个空纪录以防止再度尝试加载
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
  }

  async getResourceModel(u: TUrlSRIInfo) {
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
          resource.content = `console.warn("ScriptCat: couldn't load resource from URL ${u.originalUrl} due to a SRI error ");`;
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
      if (type === "require" || type === "require-css") {
        resource.content = await readBlobContent(data, contentType); // @require和@require-css 是会转换成代码运行的，可以进行解码
      } else {
        resource.content = await data.text(); // @resource 应该要保留原汁原味
      }
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
