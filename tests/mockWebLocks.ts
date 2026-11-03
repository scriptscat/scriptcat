import { vi } from "vitest";

// happy-dom 没有 Web Locks。所有锁名共用一条队列串行执行（比真实实现更严格），被锁保护的读写仍走真实的 chrome.storage mock。
export function mockWebLocks() {
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
