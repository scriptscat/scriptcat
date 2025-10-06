type TStackFn<T> = (...args: any[]) => Promise<T>;
type TStack<T> = { task: TStackFn<T>; resolve: any }[];
const stacks = {} as Record<string, TStack<any>>;

const startAsync = async <T>(stack: TStack<T>) => {
  let stackEntry;
  while ((stackEntry = stack.shift())) {
    const ret = await stackEntry.task();
    stackEntry.resolve(ret);
  }
};

export const stackAsyncTask = <T>(key: string, task: TStackFn<T>): Promise<T> => {
  return new Promise((resolve) => {
    const stack: TStack<T> = stacks[key] || (stacks[key] = []);
    const start = stack.length === 0;
    stack.push({ task, resolve });
    if (start) {
      startAsync<T>(stack);
    }
  });
};
