export class ReadyWrap {
  public isReady: boolean = false;
  private resolve: ((value: void | PromiseLike<void>) => void) | null = null;
  private promise: Promise<void> | null = new Promise<void>((resolve) => {
    this.resolve = resolve;
  });
  onReady(fn: () => any) {
    this.isReady ? fn() : this.promise!.then(fn);
  }
  setReady() {
    this.resolve?.();
    this.isReady = true;
    this.resolve = null;
    this.promise = null;
  }
}
