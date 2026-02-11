// 加载全局缓存

let loadCachePromise: Promise<Partial<Record<string, any>>> | undefined = undefined;
let cache: Partial<Record<string, any>> | undefined = undefined;

// 加载数据到缓存
export function loadCache(): Promise<Partial<Record<string, any>>> {
  if (cache) {
    return Promise.resolve(cache);
  }
  if (!loadCachePromise) {
    loadCachePromise = new Promise<Partial<Record<string, any>>>((resolve) => {
      chrome.storage.local.get((result: Partial<Record<string, any>> | undefined) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.storage.local.get:", lastError);
          // 无视storage API错误，继续执行
        }
        cache = result || {};
        loadCachePromise = undefined;
        resolve(cache);
      });
    });
  }
  return loadCachePromise;
}

function saveCacheAndStorage<T>(key: string, value: T): Promise<T>;
function saveCacheAndStorage<T>(items: Record<string, T>): Promise<void>;
function saveCacheAndStorage<T>(keyOrItems: string | Record<string, T>, value?: T): Promise<T | void> {
  if (typeof keyOrItems === "string") {
    return Promise.all([
      loadCache().then((cache) => {
        cache[keyOrItems] = value;
      }),
      new Promise<void>((resolve) => {
        chrome.storage.local.set({ [keyOrItems]: value }, () => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            console.error("chrome.runtime.lastError in chrome.storage.local.set:", lastError);
            // 无视storage API错误，继续执行
          }
          resolve();
        });
      }),
    ]).then(() => value);
  } else {
    const items = keyOrItems;
    return Promise.all([
      loadCache().then((cache) => {
        Object.assign(cache, items);
      }),
      new Promise<void>((resolve) => {
        chrome.storage.local.set(items, () => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            console.error("chrome.runtime.lastError in chrome.storage.local.set:", lastError);
            // 无视storage API错误，继续执行
          }
          resolve();
        });
      }),
    ]).then(() => undefined);
  }
}

function saveStorage<T>(key: string, value: T): Promise<T>;
function saveStorage<T>(items: Record<string, T>): Promise<void>;
function saveStorage<T>(keyOrItems: string | Record<string, T>, value?: T): Promise<T | void> {
  return new Promise((resolve) => {
    const items = typeof keyOrItems === "string" ? { [keyOrItems]: value } : keyOrItems;
    chrome.storage.local.set(items, () => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.storage.local.set:", lastError);
        // 无视storage API错误，继续执行
      }
      resolve(value);
    });
  });
}

function saveStorageRecord(record: Partial<Record<string, any>>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(record, () => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.storage.local.set:", lastError);
        // 无视storage API错误，继续执行
      }
      resolve();
    });
  });
}

function getCache(key: string): Promise<any> {
  return loadCache().then((cache) => {
    if (cache[key]) {
      return Object.assign({}, cache[key]);
    }
    return cache[key];
  });
}

function getStorage(key: string): Promise<any> {
  return new Promise((resolve) => {
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

function getStorageRecord(keys: string[]): Promise<Partial<Record<string, any>>> {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.storage.local.get:", lastError);
        // 无视storage API错误，继续执行
      }
      resolve(result);
    });
  });
}

function deleteCache(key: string) {
  return loadCache().then((cache) => {
    delete cache[key];
  });
}

function deleteStorage(key: string) {
  return new Promise<void>((resolve) => {
    chrome.storage.local.remove(key, () => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.storage.local.remove:", lastError);
        // 无视storage API错误，继续执行
      }
      resolve();
    });
  });
}

export function deletesStorage(keys: string[]) {
  return new Promise<void>((resolve) => {
    chrome.storage.local.remove(keys, () => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.storage.local.remove:", lastError);
        // 无视storage API错误，继续执行
      }
      resolve();
    });
  }).catch(async () => {
    // fallback
    for (const key of keys) {
      await deleteStorage(key);
    }
  });
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
    key = this.joinKey(key);
    if (this.useCache) {
      return saveCacheAndStorage(key, val);
    }
    return saveStorage(key, val);
  }

  public get(key: string): Promise<T | undefined> {
    key = this.joinKey(key);
    if (this.useCache) {
      return getCache(key);
    }
    return getStorage(key);
  }

  public gets(keys: string[]): Promise<(T | undefined)[]> {
    keys = keys.map((key) => this.joinKey(key));
    if (this.useCache) {
      return loadCache().then((cache) => {
        return keys.map((key) => {
          if (cache[key]) {
            return Object.assign({}, cache[key]);
          }
          return cache[key];
        });
      });
    }
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (result) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.storage.local.get:", lastError);
          // 无视storage API错误，继续执行
        }
        resolve(keys.map((key) => result[key]));
      });
    });
  }

  public getRecord(keys: string[]): Promise<Partial<Record<string, T>>> {
    keys = keys.map((key) => this.joinKey(key));
    if (this.useCache) {
      return loadCache().then((cache) => {
        const record: Partial<Record<string, T>> = {};
        for (const key of keys) {
          if (cache[key]) {
            record[key] = Object.assign({}, cache[key]);
          } else {
            record[key] = cache[key];
          }
        }
        return record;
      });
    }
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (result) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.storage.local.get:", lastError);
          // 无视storage API错误，继续执行
        }
        resolve(result as Partial<Record<string, T>>);
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
  }

  async findOne(filters?: (key: string, value: T) => boolean): Promise<T | undefined> {
    return this.find(filters).then((list) => {
      if (list.length > 0) {
        return list[0];
      }
      return undefined;
    });
  }

  public delete(key: string): Promise<void> {
    key = this.joinKey(key);
    if (this.useCache) {
      return Promise.all([deleteCache(key), deleteStorage(key)]).then(() => undefined);
    }
    return deleteStorage(key);
  }

  public deletes(keys: string[]): Promise<void> {
    keys = keys.map((key) => this.joinKey(key));
    if (this.useCache) {
      return loadCache().then((cache) => {
        for (const key of keys) {
          delete cache[key];
        }
        return deletesStorage(keys);
      });
    }
    return deletesStorage(keys);
  }

  // 資料不存在時無法更新, 回傳 false
  // 資料存在時進行Object.assign更新，回傳更新後的資料項目
  update(key: string, val: Partial<T>): Promise<T | false> {
    key = this.joinKey(key);
    if (this.useCache) {
      return loadCache().then((cache) => {
        const data = cache[key] as T;
        if (data) {
          Object.assign(data, val);
          return saveCacheAndStorage(key, data) as Promise<T | false>;
        }
        return false;
      });
    }
    return getStorage(key).then((result) => {
      if (result) {
        Object.assign(result, val);
        return saveStorage(key, result) as T;
      } else {
        return false;
      }
    });
  }

  updates(keys: string[], val: Partial<T>): Promise<(T | false)[]>;
  updates(items: Record<string, Partial<T>>): Promise<Record<string, T | false>>;
  updates(
    keysOrItems: string[] | Record<string, Partial<T>>,
    val?: Partial<T>
  ): Promise<(T | false)[] | Record<string, T | false>> {
    let keys: string[];
    if (Array.isArray(keysOrItems)) {
      keys = keysOrItems.map((key) => this.joinKey(key));
    } else {
      keys = Object.keys(keysOrItems).map((key) => this.joinKey(key));
    }
    if (this.useCache) {
      return loadCache().then(async (cache) => {
        if (Array.isArray(keysOrItems)) {
          const saveRecord: Record<string, T> = {};
          const result: (T | false)[] = [];
          keys.forEach((key) => {
            const data = cache[key] as T;
            if (data) {
              Object.assign(data, val);
              saveRecord[key] = data;
              result.push(data);
            } else {
              result.push(false);
            }
          });
          return saveCacheAndStorage(saveRecord).then(() => result);
        }
        const saveRecord: Record<string, T> = {};
        const result: Record<string, T | false> = {};
        for (const key in keysOrItems) {
          const cacheKey = this.joinKey(key);
          const data = cache[cacheKey] as T;
          if (data) {
            Object.assign(data, keysOrItems[key]);
            saveRecord[cacheKey] = data;
            result[key] = data;
          } else {
            result[key] = false;
          }
        }
        return saveCacheAndStorage(saveRecord).then(() => result);
      });
    }
    return getStorageRecord(keys).then((record) => {
      let result: (T | false)[] | Record<string, T | false>;
      if (Array.isArray(keysOrItems)) {
        result = keys.map((key) => {
          const o = record[key];
          if (o) {
            Object.assign(o, val);
            return o as T;
          }
          return false;
        }) as (T | false)[];
      } else {
        result = {};
        for (const key in keysOrItems) {
          const recordKey = this.joinKey(key);
          const o = record[recordKey];
          if (o) {
            Object.assign(o, keysOrItems[key]);
            record[recordKey] = o;
            result[key] = o;
          } else {
            result[key] = false;
          }
        }
      }
      return saveStorageRecord(record).then(() => result);
    });
  }

  all(): Promise<T[]> {
    return this.find();
  }
}
