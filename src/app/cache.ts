import LRU from "lru-cache";

export default class Cache {
  static instance: Cache = new Cache();

  static getInstance(): Cache {
    return Cache.instance;
  }

  lru: LRU<string, any>;

  private constructor() {
    this.lru = new LRU<string, any>({
      max: 10000,
      ttl: 1000 * 60 * 60,
      allowStale: false,
      updateAgeOnGet: false,
      updateAgeOnHas: false,
    });
  }

  public get(key: string): any {
    return this.lru.get(key);
  }

  public async getOrSet(key: string, set: () => Promise<any>): Promise<any> {
    let ret = await this.get(key);
    if (!ret) {
      ret = await set();
      this.set(key, ret);
    }
    return Promise.resolve(ret);
  }

  public set(key: string, value: any, ttl?: number): void {
    this.lru.set(key, value, { ttl });
  }

  public has(key: string): boolean {
    return this.lru.has(key);
  }

  public del(key: string): void {
    this.lru.delete(key);
  }
}
