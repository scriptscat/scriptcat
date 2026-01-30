export class ReadyWrap {
  public isReady: boolean = false;
  private resolve: ((value: void | PromiseLike<void>) => void) | undefined;
  private readonly promise: Promise<void> = new Promise<void>((resolve) => {
    this.resolve = resolve;
  });
  onReady(fn: () => any) {
    this.isReady ? fn() : this.promise.then(fn);
  }
  setReady() {
    this.resolve!();
    this.isReady = true;
  }
}
