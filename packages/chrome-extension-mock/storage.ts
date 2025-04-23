export default class Storage {
  sync = new CrhomeStorage();
  local = new CrhomeStorage();
  session = new CrhomeStorage();
}

export class CrhomeStorage {
  data: any = {};

  get(key: string, callback: (data: any) => void) {
    if (key === null) {
      callback(this.data);
      return;
    }
    callback({ [key]: this.data[key] });
  }

  set(data: any, callback: () => void) {
    this.data = Object.assign(this.data, data);
    callback();
  }

  remove(keys: string | string[], callback: () => void) {
    if (typeof keys === "string") {
      delete this.data[keys];
    } else {
      keys.forEach((key) => {
        delete this.data[key];
      });
    }
    callback();
  }
}
