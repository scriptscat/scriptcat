import { Repo } from "./repo";

export interface LocalStorageItem {
  key: string;
  value: any;
}

// 由于service worker不能使用localStorage，这里新建一个类来实现localStorage的功能
export class LocalStorageDAO extends Repo<LocalStorageItem> {
  constructor() {
    super("localStorage");
  }

  save(value: LocalStorageItem) {
    return super._save(value.key, value);
  }
}
