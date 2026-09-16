// 把 valueChangeListener 抽出来做一个高效执行的Class
// 删除会较慢但执行会较快
export class ListenerManager<T extends (key: string, ...args: any[]) => void> {
  private counterId = 0;
  private readonly listeners: Array<{ key: string; id: number; handler: T }> = [];

  public add(key: string, handler: T): number {
    const id = ++this.counterId;
    this.listeners[this.listeners.length] = { key, id, handler };
    return id;
  }

  public execute(key: string, ...args: T extends (key: string, ...a: infer A) => any ? A : never): void {
    for (let i = 0; i < this.listeners.length; ) {
      const listener = this.listeners[i];
      if (listener?.key !== key) {
        i += 1;
        continue;
      }
      const listenerId = listener.id;
      listener.handler?.(key, ...args);
      if (this.listeners[i]?.id === listenerId) i += 1;
    }
  }

  public remove(id: number | string): boolean {
    const idNum = +id || 0;
    if (idNum > 0) {
      for (let i = 0; i < this.listeners.length; i += 1) {
        if (this.listeners[i]?.id !== idNum) continue;
        for (let j = i + 1; j < this.listeners.length; j += 1) {
          this.listeners[j - 1] = this.listeners[j];
        }
        this.listeners.length -= 1;
        return true;
      }
    }
    return false;
  }

  public clear(): void {
    this.listeners.length = 0;
  }
}
