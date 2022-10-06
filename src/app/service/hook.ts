export type HookID =
  | "script:upsert"
  | "script:delete"
  | "script:disable"
  | "script:enable";
export type Handler = (id: HookID, data: any) => Promise<boolean>;
export default class Hook {
  static instance: Hook = new Hook();

  static getInstance() {
    return Hook.instance;
  }

  hookMap: { [key: string]: Handler[] } = {};

  constructor() {
    if (!Hook.instance) {
      Hook.instance = this;
    }
  }

  public dispatchHook(id: HookID, data: any) {
    if (!this.hookMap[id]) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      Promise.all(
        this.hookMap[id].map((func) => {
          return func(id, { ...data });
        })
      ).then(
        () => {
          resolve(true);
        },
        (e) => {
          reject(e);
        }
      );
    });
  }

  public addHook(id: HookID, func: Handler) {
    if (!this.hookMap[id]) {
      this.hookMap[id] = [];
    }
    this.hookMap[id].push(func);
  }
}
