export type HookHandler = (...args: any) => any;

export default class Hook<T = string> {
  hookMap: { [key: string]: HookHandler[] } = {};

  public trigger(id: T, ...args: any): void {
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

  public addListener(id: T, func: HookHandler) {
    if (!this.hookMap[id as string]) {
      this.hookMap[id as string] = [];
    }
    this.hookMap[id as string].push(func);
  }

  public removeListener(id: T, func: HookHandler) {
    if (!this.hookMap[id as string]) {
      return;
    }
    const index = this.hookMap[id as string].indexOf(func);
    if (index > -1) {
      this.hookMap[id as string].splice(index, 1);
    }
  }
}
