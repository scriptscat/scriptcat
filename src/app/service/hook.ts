export type HookID =
  | "script:upsert"
  | "script:delete"
  | "script:disable"
  | "script:enable";
export type Handler<T> = (id: T, data: any) => any;

export default class Hook<T = string> {
  hookMap: { [key: string]: Handler<T>[] } = {};

  public dispatchHook(id: T, data: any): void {
    if (!this.hookMap[id as string]) {
      return;
    }
    this.hookMap[id as string].forEach((func) => {
      func(id, { ...data });
    });
  }

  public addHook(id: T, func: Handler<T>) {
    if (!this.hookMap[id as string]) {
      this.hookMap[id as string] = [];
    }
    this.hookMap[id as string].push(func);
  }

  public removeHook(id: T, func: Handler<T>) {
    if (!this.hookMap[id as string]) {
      return;
    }
    const index = this.hookMap[id as string].indexOf(func);
    if (index > -1) {
      this.hookMap[id as string].splice(index, 1);
    }
  }
}
