// 加载全局缓存

let loadCachePromise: Promise<Partial<Record<string, any>>> | undefined = undefined;
let cache: Partial<Record<string, any>> | undefined = undefined;

// 加载数据到缓存
function loadCache(): Promise<Partial<Record<string, any>>> {
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

function saveCacheAndStorage<T>(key: string, value: T): Promise<T> {
  return Promise.all([
    loadCache().then((cache) => {
      cache[key] = value;
    }),
    new Promise<void>((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.storage.local.set:", lastError);
          // 无视storage API错误，继续执行
        }
        resolve();
      });
    }),
  ]).then(() => value);
}

function saveStorage<T>(key: string, value: T): Promise<T> {
  return new Promise((resolve) => {
    chrome.storage.local.set(
      {
        [key]: value,
      },
      () => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.storage.local.set:", lastError);
          // 无视storage API错误，继续执行
        }
        resolve(value);
      }
    );
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
function deletesStorage(keys: string[]) {
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

  updates(keys: string[], val: Partial<T>): Promise<(T | false)[]> {
    keys = keys.map((key) => this.joinKey(key));
    if (this.useCache) {
      return loadCache().then((cache) =>
        Promise.all(
          keys.map((key) => {
            const data = cache[key] as T;
            if (data) {
              Object.assign(data, val);
              return saveCacheAndStorage(key, data) as Promise<T>;
            }
            return false;
          })
        )
      );
    }
    return getStorageRecord(keys).then((record) => {
      const result = keys.map((key) => {
        const o = record[key];
        if (o) {
          Object.assign(o, val);
          return o as T;
        }
        return false;
      });
      return saveStorageRecord(record).then(() => result);
    });
  }

  all(): Promise<T[]> {
    return this.find();
  }
}
