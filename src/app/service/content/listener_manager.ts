import { Native } from "./global";

// 把 valueChangeListener 抽出来做一个高效执行的Class。
// 固定为 GMTypes.ValueChangeListener 的实际调用形状（生产环境唯一调用点是
// key/oldValue/newValue/remote/tabid 五参数），避免通用 rest/spread 依赖页面可篡改的
// Array 迭代协议；存储改用捕获的 Native.Map，避免下标赋值触发继承的数字 setter。
export class ListenerManager {
  private counterId = 0;
  private readonly buckets = new Native.Map<
    string,
    InstanceType<typeof Native.Map<number, GMTypes.ValueChangeListener>>
  >();

  public add(key: string, handler: GMTypes.ValueChangeListener): number {
    const id = ++this.counterId;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new Native.Map<number, GMTypes.ValueChangeListener>();
      this.buckets.set(key, bucket);
    }
    bucket.set(id, handler);
    return id;
  }

  public execute(key: string, oldValue: unknown, newValue: unknown, remote: boolean, tabid: number | undefined): void {
    const bucket = this.buckets.get(key);
    if (!bucket) return;
    bucket.forEach((handler) => {
      handler(key, oldValue, newValue, remote, tabid);
    });
  }

  public remove(id: number | string): boolean {
    const idNum = +id || 0;
    if (idNum <= 0) return false;
    let removed = false;
    this.buckets.forEach((bucket) => {
      if (!removed && bucket.has(idNum)) {
        bucket.delete(idNum);
        removed = true;
      }
    });
    return removed;
  }

  public clear(): void {
    this.buckets.clear();
  }
}
