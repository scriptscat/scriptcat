import { type SCRIPT_STATUS } from "./scripts";
import { type SUBSCRIBE_STATUS } from "./subscribe";

export type Metadata = { [key: string]: string[] | undefined };

// 加载全局缓存

let loadCachePromise: Promise<any> | undefined = undefined;
let cache: { [key: string]: any } | undefined = undefined;

// 加载数据到缓存
function loadCache(): Promise<any> {
  if (cache) {
    return Promise.resolve(cache);
  }
  if (loadCachePromise) {
    return loadCachePromise;
  }
  loadCachePromise = new Promise((resolve) => {
    chrome.storage.local.get((result: { [key: string]: any } | undefined) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.storage.local.get:", lastError);
        // 无视storage API错误，继续执行
      }
      cache = result;
      resolve(cache);
    });
  });
  return loadCachePromise;
}

function saveCache(key: string, value: any) {
  loadCache().then(() => {
    cache![key] = value;
  });
  return chrome.storage.local.set({ [key]: value });
}

function deleteCache(key: string) {
  loadCache().then(() => {
    delete cache![key];
  });
  return chrome.storage.local.remove(key);
}

export abstract class Repo<T> {
  // 开启缓存，不重复加载数据
  useCache: boolean = false;

  constructor(protected prefix: string) {
    if (!prefix.endsWith(":")) {
      this.prefix += ":";
    }
  }

  enableCache() {
    this.useCache = true;
  }

  protected joinKey(key: string) {
    return this.prefix + key;
  }

  protected async _save(key: string, val: T): Promise<T> {
    return new Promise((resolve) => {
      const data = {
        [this.joinKey(key)]: val,
      };
      if (this.useCache) {
        return saveCache(this.joinKey(key), val).then(() => {
          return resolve(val);
        });
      }
      chrome.storage.local.set(data, () => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.storage.local.set:", lastError);
          // 无视storage API错误，继续执行
        }
        resolve(val);
      });
    });
  }

  public get(key: string): Promise<T | undefined> {
    if (this.useCache) {
      return loadCache().then((cache) => {
        if (cache[this.joinKey(key)]) {
          return Object.assign({}, cache[this.joinKey(key)]);
        }
        return cache[this.joinKey(key)];
      });
    }
    return new Promise((resolve) => {
      key = this.joinKey(key);
      chrome.storage.local.get(key, (result) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.storage.local.get:", lastError);
          // 无视storage API错误，继续执行
        }
        resolve(result[key]);
      });
    });
  }

  private filter(data: { [key: string]: T }, filters?: (key: string, value: T) => boolean): T[] {
    const ret: T[] = [];
    for (const key in data) {
      if (key.startsWith(this.prefix)) {
        if (!filters || filters(key, data[key])) {
          ret.push(data[key]);
        }
      }
    }
    return ret;
  }

  public async find(filters?: (key: string, value: T) => boolean): Promise<T[]> {
    if (this.useCache) {
      return loadCache().then((cache) => {
        return this.filter(cache, filters).map((item) => {
          if (item) {
            return Object.assign({}, item);
          }
          return item;
        });
      });
    }
    const loadData = () => {
      return new Promise<T[]>((resolve) => {
        chrome.storage.local.get((result: { [key: string]: T }) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            console.error("chrome.runtime.lastError in chrome.storage.local.get:", lastError);
            // 无视storage API错误，继续执行
          }
          resolve(this.filter(result, filters));
        });
      });
    };
    return loadData();
  }

  async findOne(filters?: (key: string, value: T) => boolean): Promise<T | undefined> {
    const list = await this.find(filters);
    if (list.length > 0) {
      return list[0];
    }
    return undefined;
  }

  public delete(key: string) {
    if (this.useCache) {
      return deleteCache(this.joinKey(key));
    }
    return new Promise<void>((resolve) => {
      chrome.storage.local.remove(this.joinKey(key), () => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.storage.local.remove:", lastError);
          // 无视storage API错误，继续执行
        }
        resolve();
      });
    });
  }

  update(key: string, val: Partial<T>): Promise<T | false> {
    if (this.useCache) {
      return loadCache().then((cache) => {
        const data = cache[this.joinKey(key)];
        if (data) {
          Object.assign(data, val);
          return saveCache(this.joinKey(key), data).then(() => {
            return data;
          });
        }
        return false;
      });
    }
    return new Promise((resolve) => {
      this.get(key).then((result) => {
        if (result) {
          Object.assign(result, val);
          this._save(key, result).then(() => {
            resolve(result);
          });
        } else {
          resolve(false);
        }
      });
    });
  }

  all(): Promise<T[]> {
    return this.find();
  }
}

export interface ScriptOrSubscribe {
  name: string; // 脚本名称
  author?: string; // 脚本作者
  metadata: Metadata; // 脚本的元数据
  status: SCRIPT_STATUS | SUBSCRIBE_STATUS; // 脚本状态 1:启用 2:禁用 3:错误 4:初始化
  createtime: number; // 脚本创建时间戳
  updatetime?: number; // 脚本更新时间戳
  checktime: number; // 脚本检查更新时间戳
}
