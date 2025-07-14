export interface CacheStorage {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
  batchSet(data: { [key: string]: any }): Promise<void>;
  has(key: string): Promise<boolean>;
  del(key: string): Promise<void>;
  clear(): Promise<void>;
  list(): Promise<string[]>;
}

export class ExtCache implements CacheStorage {
  get(key: string): Promise<any> {
    return new Promise((resolve) => {
      chrome.storage.session.get(key, (value) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.storage.session.get:", lastError);
          // 无视storage API错误，继续执行
        }
        resolve(value[key]);
      });
    });
  }

  set(key: string, value: any): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.session.set(
        {
          [key]: value,
        },
        () => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            console.error("chrome.runtime.lastError in chrome.storage.session.set:", lastError);
            // 无视storage API错误，继续执行
          }
          resolve();
        }
      );
    });
  }

  batchSet(data: { [key: string]: any }): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.session.set(data, () => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.storage.session.set:", lastError);
          // 无视storage API错误，继续执行
        }
        resolve();
      });
    });
  }

  has(key: string): Promise<boolean> {
    return new Promise((resolve) => {
      chrome.storage.session.get(key, (value) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.storage.session.get:", lastError);
          // 无视storage API错误，继续执行
        }
        resolve(value[key] !== undefined);
      });
    });
  }

  del(key: string): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.session.remove(key, () => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.storage.session.remove:", lastError);
          // 无视storage API错误，继续执行
        }
        resolve();
      });
    });
  }

  clear(): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.session.clear(() => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.storage.session.clear:", lastError);
          // 无视storage API错误，继续执行
        }
        resolve();
      });
    });
  }

  list(): Promise<string[]> {
    return new Promise((resolve) => {
      chrome.storage.session.get(null, (value) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.storage.session.get:", lastError);
          // 无视storage API错误，继续执行
        }
        resolve(Object.keys(value));
      });
    });
  }
}

export class MapCache {
  private map: Map<string, any> = new Map();

  get(key: string): Promise<any> {
    return new Promise((resolve) => {
      resolve(this.map.get(key));
    });
  }

  set(key: string, value: any): Promise<void> {
    return new Promise((resolve) => {
      this.map.set(key, value);
      resolve();
    });
  }

  has(key: string): Promise<boolean> {
    return new Promise((resolve) => {
      resolve(this.map.has(key));
    });
  }

  del(key: string): Promise<void> {
    return new Promise((resolve) => {
      this.map.delete(key);
      resolve();
    });
  }

  clear(): Promise<void> {
    return new Promise((resolve) => {
      this.map.clear();
      resolve();
    });
  }

  list(): Promise<string[]> {
    return new Promise((resolve) => {
      resolve(Array.from(this.map.keys()));
    });
  }
}

export async function incr(cache: Cache, key: string, increase: number): Promise<number> {
  return cache.tx<number>(key, async (value) => {
    let num = value || 0;
    num += increase;
    return num;
  });
}

export default class Cache {
  static instance: Cache = new Cache(new ExtCache());

  static getInstance(): Cache {
    return Cache.instance;
  }

  private constructor(private storage: CacheStorage) {}

  public get(key: string): Promise<any> {
    return this.storage.get(key);
  }

  public async getOrSet<T>(key: string, set: () => Promise<T> | T): Promise<T> {
    let ret = await this.get(key);
    if (!ret) {
      ret = await set();
      this.set(key, ret);
    }
    return ret;
  }

  public set(key: string, value: any): Promise<void> {
    return this.storage.set(key, value);
  }

  public batchSet(data: { [key: string]: any }): Promise<void> {
    return this.storage.batchSet(data);
  }

  public has(key: string): Promise<boolean> {
    return this.storage.has(key);
  }

  public del(key: string): Promise<void> {
    return this.storage.del(key);
  }

  public clear(): Promise<void> {
    return this.storage.clear();
  }

  public list(): Promise<string[]> {
    return this.storage.list();
  }

  private txLock: Map<string, ((unlock: () => void) => void)[]> = new Map();

  lock(key: string): Promise<() => void> | (() => void) {
    const hasLock = this.txLock.has(key);

    const unlock = () => {
      const waitFunc = this.txLock.get(key)?.shift();
      if (waitFunc) {
        waitFunc(unlock);
      } else {
        this.txLock.delete(key);
      }
    };

    if (hasLock) {
      let lock = this.txLock.get(key);
      if (!lock) {
        lock = [];
        this.txLock.set(key, lock);
      }
      return new Promise<() => void>((resolve) => {
        lock.push(resolve);
      });
    }
    this.txLock.set(key, []);
    return unlock;
  }

  // 事务处理,如果有事务正在进行,则等待
  public async tx<T>(key: string, set: (result: T) => Promise<T>): Promise<T> {
    const unlock = await this.lock(key);
    let newValue: T;
    await this.get(key)
      .then((result) => set(result))
      .then((value) => {
        if (value) {
          newValue = value;
          return this.set(key, value);
        } else if (value === undefined) {
          return this.del(key);
        }
      });
    unlock();
    return newValue!;
  }
}
