export class Semaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(readonly limit: number) {
    if (limit < 1) throw new Error("limit must be >= 1");
  }

  async acquire() {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
  }

  release() {
    if (this.active > 0) {
      this.active--;
      this.queue.shift()?.();
    } else {
      console.warn("Semaphore double release detected");
    }
  }
}

type TWithTimeoutNotifyResult<T> = {
  timeouted: boolean;
  result: T | undefined;
  done: boolean;
  err: undefined | Error;
};
export const withTimeoutNotify = <T>(
  promise: Promise<T>,
  time: number,
  fn: (res: TWithTimeoutNotifyResult<T>) => any
) => {
  const res: TWithTimeoutNotifyResult<T> = { timeouted: false, result: undefined, done: false, err: undefined };
  const cid = setTimeout(() => {
    res.timeouted = true;
    fn(res);
  }, time);
  return promise
    .then((result: T) => {
      clearTimeout(cid);
      res.result = result;
      res.done = true;
      fn(res);
      return res;
    })
    .catch((e) => {
      clearTimeout(cid);
      res.err = e;
      res.done = true;
      fn(res);
      return res;
    });
};
