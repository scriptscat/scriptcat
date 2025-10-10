// 把 valueChangeListener 抽出来做一个高效执行的Class
// 删除会较慢但执行会较快
export class ListenerManager<T extends (key: string, ...args: any[]) => void> {
  private counterId = 0;
  private readonly listeners = new Map<string, Map<number, T>>();

  public add(key: string, handler: T): number {
    const id = ++this.counterId;
    let listenrMap = this.listeners.get(key);
    if (!listenrMap) {
      this.listeners.set(key, (listenrMap = new Map()));
    }
    listenrMap.set(id, handler);
    return id;
  }

  public execute(key: string, ...args: T extends (key: string, ...a: infer A) => any ? A : never): void {
    const handlers = this.listeners.get(key);
    if (handlers) {
      for (const handler of handlers.values()) {
        handler?.(key, ...args);
      }
    }
  }

  public remove(id: number | string): boolean {
    const idNum = +id || 0;
    if (idNum > 0) {
      for (const [key, handlers] of this.listeners) {
        if (handlers.delete(idNum)) {
          if (handlers.size === 0) {
            this.listeners.delete(key);
          }
          return true;
        }
      }
    }
    return false;
  }
}
