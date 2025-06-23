import LoggerCore from "@App/app/logger/core";
import crypto from "crypto-js";
import Logger from "@App/app/logger/logger";
import { Resource, ResourceDAO, ResourceHash, ResourceType } from "@App/app/repo/resource";
import { Script } from "@App/app/repo/scripts";
import { MessageQueue } from "@Packages/message/message_queue";
import { Group } from "@Packages/message/server";
import { isText } from "@App/pkg/utils/istextorbinary";
import { blobToBase64 } from "@App/pkg/utils/script";
import { ResourceBackup } from "@App/pkg/backup/struct";
import { subscribeScriptDelete } from "../queue";
import Cache from "@App/app/cache";

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

  public async getResource(uuid: string, url: string, type: ResourceType): Promise<Resource | undefined> {
    let res = await this.getResourceModel(url);
    if (res) {
      return Promise.resolve(res);
    }
    return Promise.resolve(undefined);
  }

  public async getScriptResources(script: Script): Promise<{ [key: string]: Resource }> {
    return await Promise.resolve({
      ...((await this.getResourceByType(script, "require")) || {}),
      ...((await this.getResourceByType(script, "require-css")) || {}),
      ...((await this.getResourceByType(script, "resource")) || {}),
    });
  }

  async getResourceByType(script: Script, type: ResourceType): Promise<{ [key: string]: Resource }> {
    if (!script.metadata[type]) {
      return Promise.resolve({});
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
            const res = await this.getResource(script.uuid, path, type);
            if (res) {
              ret[resourceKey] = res;
            }
          }
        }
      })
    );
    return Promise.resolve(ret);
  }

  // 更新资源
  async checkScriptResource(script: Script) {
    return Promise.resolve({
      ...((await this.checkResourceByType(script, "require")) || {}),
      ...((await this.checkResourceByType(script, "require-css")) || {}),
      ...((await this.checkResourceByType(script, "resource")) || {}),
    });
  }

  async checkResourceByType(script: Script, type: ResourceType): Promise<{ [key: string]: Resource }> {
    if (!script.metadata[type]) {
      return Promise.resolve({});
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
    return Promise.resolve(ret);
  }

  async checkResource(uuid: string, url: string, type: ResourceType) {
    let res = await this.getResourceModel(url);
    if (res) {
      // 判断1分钟过期
      if ((res.updatetime || 0) > new Date().getTime() - 1000 * 60) {
        return Promise.resolve(res);
      }
    }
    try {
      res = await this.updateResource(uuid, url, type);
      if (res) {
        return Promise.resolve(res);
      }
    } catch (e: any) {
      // ignore
      this.logger.error("check resource failed", { uuid, url }, Logger.E(e));
    }
    return Promise.resolve(undefined);
  }

  async updateResource(uuid: string, url: string, type: ResourceType) {
    // 重新加载
    const u = this.parseUrl(url);
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
    return Promise.resolve(result);
  }

  async getResourceModel(url: string) {
    const u = this.parseUrl(url);
    const resource = await this.resourceDAO.get(u.url);
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
          const wordArray = crypto.lib.WordArray.create(<ArrayBuffer>reader.result);
          resolve({
            md5: crypto.MD5(wordArray).toString(),
            sha1: crypto.SHA1(wordArray).toString(),
            sha256: crypto.SHA256(wordArray).toString(),
            sha384: crypto.SHA384(wordArray).toString(),
            sha512: crypto.SHA512(wordArray).toString(),
          });
        }
      };
    });
  }

  loadByUrl(url: string, type: ResourceType): Promise<Resource> {
    const u = this.parseUrl(url);
    return fetch(u.url)
      .then(async (resp) => {
        if (resp.status !== 200) {
          throw new Error(`resource response status not 200: ${resp.status}`);
        }
        return {
          data: await resp.blob(),
          headers: resp.headers,
        };
      })
      .then(async (response) => {
        const resource: Resource = {
          url: u.url,
          content: "",
          contentType: (response.headers.get("content-type") || "application/octet-stream").split(";")[0],
          hash: await this.calculateHash(<Blob>response.data),
          base64: "",
          link: {},
          type,
          createtime: new Date().getTime(),
        };
        const arrayBuffer = await (<Blob>response.data).arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        if (isText(uint8Array)) {
          resource.content = await (<Blob>response.data).text();
        }
        resource.base64 = (await blobToBase64(<Blob>response.data)) || "";
        return resource;
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

  async deleteResource(url: string) {
    // 删除缓存
    const res = await this.resourceDAO.get(url);
    if (!res) {
      throw new Error("resource not found");
    }
    return this.resourceDAO.delete(url);
  }

  importResource(uuid: string, data: ResourceBackup, type: ResourceType) {
    // 导入资源
    if (!data.source) {
      return Promise.resolve(undefined);
    }
    return this.resourceDAO.get(data.meta.url).then(async (res) => {
      if (!res) {
        // 新增资源
        res = {
          url: data.meta.url,
          content: data.source!,
          contentType: data.meta.mimetype || "",
          hash: await this.calculateHash(new Blob([data.source!])),
          base64: await blobToBase64(new Blob([data.source!])),
          link: {},
          type,
          createtime: new Date().getTime(),
          updatetime: new Date().getTime(),
        };
      }
      res.link[uuid] = true;
      res.updatetime = new Date().getTime();
      return this.resourceDAO.update(data.meta.url, res);
    });
  }

  init() {
    this.group.on("getScriptResources", this.getScriptResources.bind(this));
    this.group.on("deleteResource", this.deleteResource.bind(this));

    // 删除相关资源
    subscribeScriptDelete(this.mq, (data) => {
      // 使用事务当锁，避免并发删除导致数据不一致
      Cache.getInstance().tx("resource_lock", async (start) => {
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
