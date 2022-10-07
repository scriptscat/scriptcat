export type HookID =
  | "script:upsert"
  | "script:delete"
  | "script:disable"
  | "script:enable";
export type HookHandler = (...args: any) => any;

export default class Hook<T = string> {
  hookMap: { [key: string]: HookHandler[] } = {};

  public dispatchHook(id: T, ...args: any): void {
    if (!this.hookMap[id as string]) {
      return;
    }
    const copyArgs: any[] = [];
    args.forEach((arg: any) => {
      if (typeof arg === "object") {
        copyArgs.push({ ...arg });
      } else {
        copyArgs.push(arg);
      }
    });
    this.hookMap[id as string].forEach((func) => {
      func(...copyArgs);
    });
  }

  public addHook(id: T, func: HookHandler) {
    if (!this.hookMap[id as string]) {
      this.hookMap[id as string] = [];
    }
    this.hookMap[id as string].push(func);
  }

  public removeHook(id: T, func: HookHandler) {
    if (!this.hookMap[id as string]) {
      return;
    }
    const index = this.hookMap[id as string].indexOf(func);
    if (index > -1) {
      this.hookMap[id as string].splice(index, 1);
    }
  }
}
