import LoggerCore from "@App/app/logger/core";
import crypto from "crypto-js";
import Logger from "@App/app/logger/logger";
import { Resource, ResourceDAO, ResourceHash, ResourceType } from "@App/app/repo/resource";
import { Script } from "@App/app/repo/scripts";
import { MessageQueue } from "@Packages/message/message_queue";
import { Group } from "@Packages/message/server";
import { isText } from "@App/pkg/utils/istextorbinary";
import { blobToBase64 } from "@App/pkg/utils/script";

export class ResourceService {
  logger: Logger;
  resourceDAO: ResourceDAO = new ResourceDAO();

  constructor(
    private group: Group,
    private mq: MessageQueue
  ) {
    this.logger = LoggerCore.logger().with({ service: "resource" });
  }

  public async getResource(uuid: string, url: string, type: ResourceType): Promise<Resource | undefined> {
    let res = await this.getResourceModel(url);
    if (res) {
      return Promise.resolve(res);
    }
    try {
      res = await this.addResource(url, uuid, type);
      if (res) {
        return Promise.resolve(res);
      }
    } catch (e: any) {
      // ignore
      this.logger.error("get resource failed", { uuid, url }, Logger.E(e));
    }
    return Promise.resolve(undefined);
  }

  public async getScriptResources(script: Script): Promise<{ [key: string]: Resource }> {
    return Promise.resolve({
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
      script.metadata[type].map(async (u) => {
        if (type === "resource") {
          const split = u.split(/\s+/);
          if (split.length === 2) {
            const res = await this.getResource(script.uuid, split[1], "resource");
            if (res) {
              ret[split[0]] = res;
            }
          }
        } else {
          const res = await this.getResource(script.uuid, u, type);
          if (res) {
            ret[u] = res;
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
      res = await this.updateResource(url, uuid, type);
      if (res) {
        return Promise.resolve(res);
      }
    } catch (e: any) {
      // ignore
      this.logger.error("check resource failed", { uuid, url }, Logger.E(e));
    }
    return Promise.resolve(undefined);
  }

  async updateResource(url: string, uuid: string, type: ResourceType) {
    // 重新加载
    const u = this.parseUrl(url);
    let result = await this.getResourceModel(u.url);
    try {
      const resource = await this.loadByUrl(u.url, type);
      resource.updatetime = new Date().getTime();
      if (!result) {
        // 资源不存在,保存
        resource.createtime = new Date().getTime();
        resource.link = { uuid: true };
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

  public async addResource(url: string, uuid: string, type: ResourceType): Promise<Resource> {
    const u = this.parseUrl(url);
    let result = await this.getResourceModel(u.url);
    // 资源不存在,重新加载
    if (!result) {
      try {
        const resource = await this.loadByUrl(u.url, type);
        resource.link[uuid] = true;
        resource.createtime = new Date().getTime();
        resource.updatetime = new Date().getTime();
        await this.resourceDAO.save(resource);
        result = resource;
        this.logger.info("load resource success", { url: u.url });
      } catch (e) {
        this.logger.error("load resource error", { url: u.url }, Logger.E(e));
        throw e;
      }
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
          // 尝试重新加载
          this.loadByUrl(u.url, resource.type).then((reloadRes) => {
            this.logger.info("reload resource success", {
              url: u.url,
              hash: {
                expected: u.hash,
                old: resource.hash,
                new: reloadRes.hash,
              },
            });
            reloadRes.updatetime = new Date().getTime();
            this.resourceDAO.save(reloadRes);
          });
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
          throw new Error(`resource response status not 200:${resp.status}`);
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

  init() {
    this.group.on("getScriptResources", this.getScriptResources.bind(this));
  }
}
