// 一个简单的队列,可以使用pop阻塞等待消息
export default class Queue<T> {
  list: T[] = [];

  resolve?: (data: T) => void;

  push(data: T) {
    if (this.resolve) {
      this.resolve(data);
      this.resolve = undefined;
    } else {
      this.list.push(data);
    }
  }

  pop(): Promise<T | undefined> {
    return new Promise((resolve) => {
      if (this.list.length > 0) {
        resolve(this.list.shift());
      } else {
        this.resolve = resolve;
      }
    });
  }
}
