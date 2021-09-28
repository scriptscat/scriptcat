import { ChangeCallback, Storage } from "./storage";

export class ChromeStorage implements Storage {
    private prefix: string;
    private storage: chrome.storage.StorageArea;
    constructor(prefix: string) {
        this.prefix = prefix + '_';
        this.storage = chrome.storage.sync;
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

    public keys(): Promise<{ [key: string]: any }> {
        return new Promise((resolve) => {
            let ret: { [key: string]: any } = {};
            let prefix = this.buildKey('');
            this.storage.get((items) => {
                for (const key in items) {
                    if (key.indexOf(prefix) == 0) {
                        ret[key.substring(prefix.length)] = items[key];
                    }
                }
                resolve(ret);
            });
        });
    }

    public listenChange(callback: ChangeCallback): void {

    }

}