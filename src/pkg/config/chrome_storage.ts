export default class ChromeStorage {
  private prefix: string;

  private storage: chrome.storage.StorageArea;

  constructor(prefix: string, sync: boolean) {
    this.prefix = `${prefix}_`;
    this.storage = sync ? chrome.storage.sync : chrome.storage.local;
  }

  public buildKey(key: string): string {
    return this.prefix + key;
  }

  public get(key: string): Promise<any> {
    return new Promise((resolve) => {
      key = this.buildKey(key);
      this.storage.get(key, (items) => {
        resolve(items[key]);
      });
    });
  }

  public set(key: string, value: any): Promise<void> {
    return new Promise((resolve) => {
      const kvp: { [key: string]: any } = {};
      kvp[this.buildKey(key)] = value;
      this.storage.set(kvp, () => resolve());
    });
  }

  public remove(key: string): Promise<void> {
    return new Promise((resolve) => {
      this.storage.remove(this.buildKey(key), () => resolve());
    });
  }

  public removeAll(): Promise<void> {
    return new Promise((resolve) => {
      this.storage.clear(() => resolve());
    });
  }

  public keys(): Promise<{ [key: string]: any }> {
    return new Promise((resolve) => {
      const ret: { [key: string]: any } = {};
      const prefix = this.buildKey("");
      this.storage.get((items) => {
        Object.keys(items).forEach((key) => {
          if (key.startsWith(prefix)) {
            ret[key.substring(prefix.length)] = items[key];
          }
        });
        resolve(ret);
      });
    });
  }
}
