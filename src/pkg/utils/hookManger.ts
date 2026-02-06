export class HookManager {
  public isMounted: boolean = true;
  private unhooks: ((...args: any) => any)[] | null = [];
  public append(...fns: ((...args: any) => any)[]) {
    this.unhooks!.push(...fns);
  }
  public readonly unhook = () => {
    this.isMounted = false;
    for (const unhook of this.unhooks!) unhook();
    this.unhooks!.length = 0;
    this.unhooks = null;
  };
}
