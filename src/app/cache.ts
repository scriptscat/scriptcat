export default class Cache {
  static instance: Cache = new Cache();

  static getInstance(): Cache {
    return Cache.instance;
  }

  map: Map<string, any>;

  private constructor() {
    this.map = new Map<string, any>();
  }

  public get(key: string): any {
    return this.map.get(key);
  }

  public async getOrSet(key: string, set: () => Promise<any>): Promise<any> {
    let ret = this.get(key);
    if (!ret) {
      ret = await set();
      this.set(key, ret);
    }
    return Promise.resolve(ret);
  }

  public set(key: string, value: any): void {
    this.map.set(key, value);
  }

  public has(key: string): boolean {
    return this.map.has(key);
  }

  public del(key: string): void {
    this.map.delete(key);
  }

  public list(): string[] {
    return Array.from(this.map.keys());
  }
}
