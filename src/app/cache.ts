import { stackAsyncTask } from "@App/pkg/utils/async_queue";

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

  // 事务处理,如果有事务正在进行,则等待
  public tx<T, CB extends (val: T | undefined, tx: { set: (newVal: T) => void; del: () => void }) => any>(
    key: string,
    callback: CB
  ): Promise<Awaited<ReturnType<CB>>> {
    const enum Actions {
      NONE = 0,
      SET = 1,
      DEL = 2,
    }
    return stackAsyncTask(key, () => {
      let ret: Awaited<ReturnType<CB>>;
      const act = { action: Actions.NONE } as { action?: number; newVal?: T };
      return this.get<T>(key)
        .then((result) => {
          const tx = {
            set: (newVal: T) => {
              act.action = Actions.SET;
              act.newVal = newVal;
            },
            del: () => {
              act.action = Actions.DEL;
              act.newVal = undefined;
            },
          };
          return callback(result, tx);
        })
        .then((result) => {
          ret = result;
          if (act.action === Actions.SET) {
            return this.set(key, act.newVal);
          } else if (act.action === Actions.DEL) {
            return this.del(key);
          }
        })
        .then(() => ret);
    });
  }

  incr(key: string, increase: number): Promise<number> {
    return this.tx(key, (value: number | undefined, tx) => {
      value = (value || 0) + increase;
      tx.set(value);
      return value;
    });
  }
}

export type ICacheSet<T> = (result: T | undefined) => Promise<T | undefined> | T | undefined;

export const cacheInstance = new Cache();
