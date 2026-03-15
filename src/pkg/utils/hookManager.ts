export class HookManager {
  public isMounted: boolean = true;
  // 存储卸载时调用的钩子函数；unhook 后置为 null
  private unhooks: (() => void)[] | null = [];
  public append(...fns: ((...args: any) => any)[]) {
    // 已经 unhook 的情况下保持幂等，直接忽略追加
    this.unhooks?.push(...fns);
  }
  public readonly unhook = () => {
    // 已经 unhook 过则保持幂等
    this.isMounted = false;
    if (this.unhooks !== null) {
      for (const unhook of this.unhooks!) unhook();
      this.unhooks!.length = 0;
      this.unhooks = null;
    }
  };
}
