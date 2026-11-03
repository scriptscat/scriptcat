import { vi } from "vitest";

// happy-dom 没有 Web Locks；模拟同名锁的串行调度，使并发读取走真实的本地存储。
export function mockIdentityLock() {
  let tail = Promise.resolve();
  vi.spyOn(navigator, "locks", "get").mockReturnValue({
    request: (_name: string, run: () => Promise<unknown>) => {
      const result = tail.then(run);
      tail = result.then(
        () => undefined,
        () => undefined
      );
      return result;
    },
  } as LockManager);
}
