type TStackFn<T> = (...args: any[]) => Promise<T>;
type TStack<T> = { task: TStackFn<T>; resolve: any; reject: any }[] & { active?: boolean };
const stacks = {} as Record<string, TStack<any>>;

const startAsync = async <T>(stack: TStack<T>) => {
  let stackEntry;
  stack.active = true;
  while ((stackEntry = stack.shift())) {
    try {
      const ret = await stackEntry.task();
      stackEntry.resolve(ret);
    } catch (e: any) {
      stackEntry.reject(e);
    }
  }
  stack.active = false;
};

export const stackAsyncTask = <T>(key: string, task: TStackFn<T>): Promise<T> => {
  return new Promise((resolve, reject) => {
    const stack: TStack<T> = stacks[key] || (stacks[key] = []);
    stack.push({ task, resolve, reject });
    if (!stack.active) {
      startAsync<T>(stack);
    }
  });
};

// 僅用於單元測試
export const clearStack = () => {
  for (const key in stacks) {
    stacks[key].active = false;
    delete stacks[key];
  }
};
