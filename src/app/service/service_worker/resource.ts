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

class Semaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(readonly limit: number) {
    if (limit < 1) throw new Error("limit must be >= 1");
  }

  async acquire() {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
  }

  release() {
    if (this.active > 0) {
      this.active--;
      this.queue.shift()?.();
    } else {
      console.warn("Semaphore double release detected");
    }
  }
}

const fetchSemaphore = new Semaphore(5);

type TWithTimeoutNotifyResult<T> = {
  timeouted: boolean;
  result: T | undefined;
  done: boolean;
  err: undefined | Error;
};
const withTimeoutNotify = <T>(promise: Promise<T>, time: number, fn: (res: TWithTimeoutNotifyResult<T>) => any) => {
  const res: TWithTimeoutNotifyResult<T> = { timeouted: false, result: undefined, done: false, err: undefined };
  const cid = setTimeout(() => {
    res.timeouted = true;
    fn(res);
  }, time);
  return promise
    .then((result: T) => {
      clearTimeout(cid);
      res.result = result;
      res.done = true;
      fn(res);
      return res;
    })
    .catch((e) => {
      clearTimeout(cid);
      res.err = e;
      res.done = true;
      fn(res);
      return res;
    });
};

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

  public async getScriptResourceValue(script: Script): Promise<{ [key: string]: Resource }> {
    const [require, require_css, resource] = await this.getResourceByTypes(script, [
      "require",
      "require-css",
      "resource",
    ]);
    const ret = {
      ...require,
      ...require_css,
      ...resource,
    };

    // 注意！ 如果它们包含相同名字的Resource，会根据次序而覆盖
    const recordKeyLens = [ret, require, require_css, resource].map((record) => Object.keys(record).length);
    if (recordKeyLens[0] !== recordKeyLens[1] + recordKeyLens[2] + recordKeyLens[3]) {
      console.warn("One or more properties are merged in ResourceService.getScriptResources");
    }

    return {
      ...require,
      ...require_css,
      ...resource,
    };
  }

  public getResourceByTypes(script: Script, types: ResourceType[]): Promise<Record<string, Resource>[]> {
    const promises = types.map(async (type) => {
      const ret: Record<string, Resource> = {};
      const metadataEntries = script.metadata[type];
      const uuid = script.uuid;
      if (metadataEntries) {
        await Promise.allSettled(
          metadataEntries.map(async (mdValue) => {
            /** 资源键名 */
            let resourceKey;
            /** 文件路径 */
            let resourcePath: string;
            if (type === "resource") {
              // @resource xxx https://...
              const split = mdValue.split(/\s+/);
              if (split.length !== 2) return; // @resource 必须有 key 和 path. "xxx yyy zzz" 也不符合格式要求
              resourceKey = split[0];
              resourcePath = split[1].trim();
            } else {
              // require / require-css 的话，使用 url 作为 resourceKey
              resourceKey = mdValue;
              resourcePath = mdValue;
            }
            if (resourcePath) {
              const u = parseUrlSRI(resourcePath);
              const oldResources = await this.getResourceModel(u);
              let freshResource: Resource | undefined = undefined;
              if (oldResources && !resourcePath.startsWith("file:///")) {
                // 读取过但失败的资源加载也会被放在缓存，避免再加载资源
                // 因此 getResource 时不会再加载资源，直接返回 undefined 表示没有资源
                if (!oldResources.contentType) {
                  freshResource = undefined;
                } else {
                  freshResource = oldResources;
                }
              } else {
                // 1) 如果是file://协议，则每次请求更新一下文件
                // 2) 缓存中无资源加载纪录，需要取得资源
                freshResource = await this.updateResource(uuid, u, type, oldResources);
                // 没有 oldResources 时，下载资源失败还是会生成一个空 Resource，避免重复尝试失败的下载
              }
              if (freshResource) {
                // 空资源也储存一下，确保 resourceDAO 的记录和 script 的 resourceValue 记录一致
                ret[resourceKey] = freshResource;
              }
            }
          })
        );
      }
      return ret;
    });
    return Promise.all(promises);
  }

  // 只需要等待Promise返回，不理会返回值（失败也可以）
  updateResourceByTypes(script: Script, types: ResourceType[]): Promise<any> {
    const uuid = script.uuid;
    const metadata = script.metadata;
    const promises = types.map((type) => {
      const promises = metadata[type]?.map(async (u) => {
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
          // 非空值 url 且 url 不是本地档案 -> 检查最后更新时间 (空资源除外)
          if (u.url && !u.url.startsWith("file:///") && oldResources?.contentType) {
            const updateTime = oldResources.updatetime;
            // 资源最后更新是24小时内则不更新
            // 这里是假设 resources 都是 static. 使用者应该加 ?d=xxxx 之类的方式提示SC要更新资源
            if (updateTime && updateTime > Date.now() - 86400_000) return;
          }
          // 旧资源或没有资源记录或本地档案，尝试更新
          await this.updateResource(uuid, u, type, oldResources);
        }
      });
      if (promises?.length) return Promise.allSettled(promises);
    });
    return Promise.all(promises);
  }

  async updateResource(uuid: string, u: TUrlSRIInfo, type: ResourceType, oldResources: Resource | undefined) {
    let result: Resource;
    let resource: Resource | undefined;
    try {
      resource = await this.createResourceByUrlFetch(u, type);
    } catch (e) {
      this.logger.error("fetch resource error", { url: u.url }, Logger.E(e));
    }
    try {
      if (resource) {
        if (!oldResources || !oldResources.contentType) {
          // 资源不存在,保存
          resource.link = { [uuid]: true };
          result = resource;
          await this.resourceDAO.save(result).catch(console.warn);
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
          await this.resourceDAO.save(result).catch(console.warn);
          this.logger.info("reload resource success", { url: u.url });
        }
        return result;
      } else {
        // 如果有旧资源，则使用旧资源
        if (oldResources) return oldResources;
        // 资源错误时（且没有旧资源）保存一个空纪录以防止再度尝试加载
        // this.resourceDAO.save 自身出错的话忽略
        const now = Date.now();
        result = {
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
          createtime: now,
          updatetime: now,
        };
        await this.resourceDAO.save(result).catch(console.warn);
        return result; // 下载失败还是回传一下 result
      }
    } catch (e) {
      this.logger.error("Unexpected error in updateResource", { url: u.url }, Logger.E(e));
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

  async createResourceByUrlFetch(u: TUrlSRIInfo, type: ResourceType): Promise<Resource> {
    const url = u.url; // 无 URI Integrity Hash

    let released = false;
    await fetchSemaphore.acquire();
    // Semaphore 锁 - 同期只有五个 fetch 一起执行
    const delay = randNum(100, 150); // 100~150ms delay before starting fetch
    await sleep(delay);
    // 执行 fetch, 若超过 800ms, 不会中止 fetch 但会启动下一个网络连接任务
    // 这只为了避免等候时间过长，同时又不会有过多网络任务同时发生，使Web伺服器返回错误
    const { result, err } = await withTimeoutNotify(fetch(url), 800, ({ done, timeouted, err }) => {
      if (timeouted || done || err) {
        // fetch 成功 或 发生错误 或 timeout 时解锁
        if (!released) {
          released = true;
          fetchSemaphore.release();
        }
      }
    });
    // Semaphore 锁已解锁。继续处理 fetch Response 的结果

    if (err) {
      throw new Error(`resource fetch failed: ${err.message || err}`);
    }

    const resp = result! as Response;

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
    let content: string = "";
    const uint8Array = new Uint8Array(arrayBuffer);
    if (isText(uint8Array)) {
      if (type === "require" || type === "require-css") {
        content = await readBlobContent(data, contentType); // @require和@require-css 是会转换成代码运行的，可以进行解码
      } else {
        content = await data.text(); // @resource 应该要保留原汁原味
      }
    }
    const now = Date.now();
    const resource: Resource = {
      url: u.url,
      content: content,
      contentType: (contentType || "application/octet-stream").split(";")[0], // 保证下载成功时必定有 contentType
      hash: hash,
      base64: base64 || "",
      link: {},
      type,
      createtime: now,
      updatetime: now,
    };
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
    return this.getScriptResourceValue(script);
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
