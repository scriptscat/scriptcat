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
    // 1. 输入归一化：统一转为 Record<string, Partial<T>>
    let items: Record<string, Partial<T>>;
    if (Array.isArray(keysOrItems)) {
      items = {};
      for (const key of keysOrItems) {
        items[key] = val!;
      }
    } else {
      items = keysOrItems;
    }

    // 2. 核心逻辑
    return this._doUpdates(items).then((resultRecord) => {
      // 3. 结果转换：恢复为调用者期望的类型
      if (Array.isArray(keysOrItems)) {
        return keysOrItems.map((key) => resultRecord[key]);
      }
      return resultRecord;
    });
  }

  private async _doUpdates(items: Record<string, Partial<T>>): Promise<Record<string, T | false>> {
    const keys = Object.keys(items);
    const joinedKeys = keys.map((key) => this.joinKey(key));

    // 1. 获取数据源
    let dataSource: Partial<Record<string, any>>;
    if (this.useCache) {
      dataSource = await loadCache();
    } else {
      dataSource = await getStorageRecord(joinedKeys);
    }

    // 2. 遍历 items，合并数据，收集结果和已修改条目
    const result: Record<string, T | false> = {};
    const saveRecord: Record<string, T> = {};

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const joinedKey = joinedKeys[i];
      const data = dataSource[joinedKey] as T;
      if (data) {
        // 缓存模式下刻意使用Object.assign修改原有对象，以更新缓存中的数据
        Object.assign(data, items[key]);
        saveRecord[joinedKey] = data;
        result[key] = data;
      } else {
        result[key] = false;
      }
    }

    // 3. 批量写入（只包含已修改的条目）
    if (Object.keys(saveRecord).length > 0) {
      if (this.useCache) {
        await saveCacheAndStorage(saveRecord);
      } else {
        await saveStorageRecord(saveRecord);
      }
    }

    return result;
  }

  all(): Promise<T[]> {
    return this.find();
  }
}
