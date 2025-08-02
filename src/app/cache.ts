interface CacheStorage {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  batchSet(data: { [key: string]: any }): Promise<void>;
  has(key: string): Promise<boolean>;
  del(key: string): Promise<void>;
  clear(): Promise<void>;
  list(): Promise<string[]>;
}

class ExtCache implements CacheStorage {
  get<T>(key: string): Promise<T | undefined> {
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

  set<T>(key: string, value: T): Promise<void> {
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

class Cache extends ExtCache {
  public async getOrSet<T>(key: string, set: () => Promise<T> | T): Promise<T> {
    let ret = await this.get<T>(key);
    if (!ret) {
      ret = await set();
      this.set(key, ret);
    }
    return ret;
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
  public async tx<T>(key: string, set: ICacheSet<T>): Promise<T> {
    const unlock = await this.lock(key);
    let newValue: T;
    await this.get<T>(key)
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

  incr(key: string, increase: number): Promise<number> {
    return this.tx<number>(key, (value) => (value || 0) + increase);
  }
}

export type ICacheSet<T> = (result: T | undefined) => Promise<T | undefined> | T | undefined;

export const cacheInstance = new Cache();
