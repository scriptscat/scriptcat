import { Storage } from "./storage";

export class ChromeStorage implements Storage {
    private prefix: string;
    private storage: chrome.storage.StorageArea;
    constructor(prefix: string) {
        this.prefix = prefix;
        this.storage = chrome.storage.local;
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
            let kvp: { [key: string]: any } = {};
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

    public keys(prefix: string): Promise<Map<string, any>> {
        return new Promise((resolve) => {
            let ret = new Map<string, any>();
            this.storage.get({}, (items) => {
                items.forEach((value: any, key: string) => {
                    if (key.indexOf(this.buildKey(prefix)) == 0) {
                        ret.set(key, value);
                    }
                });
                resolve(ret);
            });
        });
    }

}