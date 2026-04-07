import { vi } from "vitest";

/**
 * Mock OPFS 文件系统，供多个测试文件复用
 */
export function createMockOPFS() {
  function createMockWritable() {
    let data: any = null;
    return {
      write: vi.fn(async (content: any) => {
        data = content;
      }),
      close: vi.fn(async () => {}),
      getData: () => data,
    };
  }

  function createMockFileHandle(name: string, dir: Map<string, any>) {
    return {
      kind: "file" as const,
      getFile: vi.fn(async () => {
        const content = dir.get(name);
        if (typeof content === "string") return new Blob([content], { type: "application/json" });
        return new Blob([""], { type: "application/json" });
      }),
      createWritable: vi.fn(async () => {
        const writable = createMockWritable();
        const origClose = writable.close;
        writable.close = vi.fn(async () => {
          const written = writable.getData();
          dir.set(name, written);
          await origClose();
        });
        return writable;
      }),
    };
  }

  function createMockDirHandle(store: Map<string, any>): any {
    return {
      kind: "directory" as const,
      getDirectoryHandle: vi.fn(async (name: string, opts?: { create?: boolean }) => {
        if (!store.has("__dir__" + name)) {
          if (opts?.create) {
            store.set("__dir__" + name, new Map());
          } else {
            throw new Error("Not found");
          }
        }
        return createMockDirHandle(store.get("__dir__" + name));
      }),
      getFileHandle: vi.fn(async (name: string, opts?: { create?: boolean }) => {
        if (!store.has(name) && !opts?.create) {
          throw new Error("Not found");
        }
        if (!store.has(name)) {
          store.set(name, "");
        }
        return createMockFileHandle(name, store);
      }),
      removeEntry: vi.fn(async (name: string) => {
        store.delete(name);
        store.delete("__dir__" + name);
      }),
    };
  }

  const rootStore = new Map<string, any>();
  const mockRoot = createMockDirHandle(rootStore);

  Object.defineProperty(navigator, "storage", {
    value: {
      getDirectory: vi.fn(async () => mockRoot),
    },
    configurable: true,
    writable: true,
  });
}
