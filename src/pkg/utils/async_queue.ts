// 定义一个异步任务函数类型，返回 Promise
type TStackFn<T> = (...args: any[]) => Promise<T> | T;

// 链表节点类型，包含任务、Promise 的 resolve/reject、以及下一个节点
type TNode<T> = {
  task: TStackFn<T> | null;
  resolve: ((v: T | Promise<T>) => void) | null;
  reject: ((e?: any) => void) | null;
  next: TNode<T> | null;
};

// 队列（栈）结构，包含头部和尾部节点
type TStack<T> = {
  head: TNode<T> | null;
  tail: TNode<T> | null;
};

// 全局存储不同 key 对应的任务队列
const stacks = {} as Record<string, TStack<any>>;

/**
 * 异步执行任务队列中的任务
 * 会依次从 head 开始执行，直到队列为空
 */
const startAsync = async <T>(stack: TStack<T>) => {
  let node;
  while ((node = stack.head)) {
    const { task, resolve, reject } = node;

    // 目前节点的 task, resolve, reject 已被取出，清理回调引用
    node.task = node.resolve = node.reject = null;
    try {
      // 执行异步任务
      const ret = await task!();
      resolve!(ret);
    } catch (e: any) {
      reject!(e);
    }

    // 移动到下一个节点
    stack.head = node.next; // 更新head至下一个节点
    // 目前节点的 next 已被取出，清理引用
    node.next = null;
  }

  // 当队列为空时，重置 tail
  stack.tail = null;
};

/**
 * 向指定 key 的队列中添加异步任务
 * 若该队列没有正在执行的任务（!stack.tail），则启动执行
 */
export const stackAsyncTask = <T>(key: string, task: TStackFn<T>): Promise<T> => {
  return new Promise((resolve, reject) => {
    // 获取或初始化对应 key 的队列
    const stack: TStack<T> = stacks[key] || (stacks[key] = { head: null, tail: null });
    const newNode: TNode<T> = { task, resolve, reject, next: null };

    // 入队逻辑
    if (!stack.tail) {
      // 队列为空时，设为首尾节点
      stack.head = newNode;
      stack.tail = newNode;

      // ⚠️ 注意：此时会启动任务执行
      // 请勿在外部代码中同时多次调用 startAsync
      // 当前逻辑依赖 “!stack.tail” 判断来避免并发执行
      startAsync<T>(stack);
    } else {
      // 队列不为空时，追加到尾部
      stack.tail.next = newNode;
      stack.tail = newNode;
    }
  });
};
