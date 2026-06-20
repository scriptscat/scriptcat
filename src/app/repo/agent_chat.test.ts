import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentChatRepo } from "./agent_chat";

// Mock OPFS 文件系统
function createMockOPFS() {
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
        if (content instanceof Blob) return content;
        if (content instanceof ArrayBuffer) return new Blob([content]);
        if (content instanceof Uint8Array) return new Blob([content.buffer as ArrayBuffer]);
        if (typeof content === "string") return new Blob([content], { type: "application/octet-stream" });
        return new Blob([""], { type: "application/octet-stream" });
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
      [Symbol.asyncIterator]: async function* () {
        for (const [key] of store) {
          if (!key.startsWith("__dir__")) {
            yield [key, { kind: "file" }];
          }
        }
      },
    };
  }

  const rootStore = new Map<string, any>();
  const mockRoot = createMockDirHandle(rootStore);

  // 只 mock navigator.storage，避免展开 navigator 丢失 getter 属性（如 userAgent）
  // 在 isolate=false 下破坏全局 navigator 会导致后续测试 react-dom 初始化失败
  Object.defineProperty(navigator, "storage", {
    value: {
      getDirectory: vi.fn(async () => mockRoot),
    },
    configurable: true,
    writable: true,
  });

  return { rootStore, mockRoot };
}

// 在 mock store 中按路径导航/创建目录
function navigateDir(rootStore: Map<string, any>, ...path: string[]): Map<string, any> {
  let current = rootStore;
  for (const seg of path) {
    const key = "__dir__" + seg;
    if (!current.has(key)) {
      current.set(key, new Map());
    }
    current = current.get(key);
  }
  return current;
}

describe("AgentChatRepo 附件存储", () => {
  let repo: AgentChatRepo;
  let rootStore: Map<string, any>;

  beforeEach(() => {
    const mock = createMockOPFS();
    rootStore = mock.rootStore;
    repo = new AgentChatRepo();
  });

  it("saveAttachment 应保存 data URL 字符串并返回大小", async () => {
    const dataUrl = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    const size = await repo.saveAttachment("att-1", dataUrl);

    // base64 "/9j/4AAQSkZJRg==" 解码为 10 字节
    expect(size).toBeGreaterThan(0);
  });

  it("saveAttachment 应保存 Blob 数据并返回大小", async () => {
    const blob = new Blob(["hello world"], { type: "text/plain" });
    const size = await repo.saveAttachment("att-2", blob);

    expect(size).toBe(blob.size);
  });

  it("saveAttachment 应存储到 workspace/uploads 路径", async () => {
    await repo.saveAttachment("att-ws", new Blob(["workspace data"]));

    // 验证新路径存在: agents/workspace/uploads/att-ws
    const uploadsDir = navigateDir(rootStore, "agents", "workspace", "uploads");
    expect(uploadsDir.has("att-ws")).toBe(true);
  });

  it("getAttachment 应返回已保存的附件", async () => {
    const blob = new Blob(["test data"], { type: "text/plain" });
    await repo.saveAttachment("att-3", blob);

    const result = await repo.getAttachment("att-3");

    expect(result).not.toBeNull();
    expect(result).toBeInstanceOf(Blob);
  });

  it("getAttachment 不存在的附件应返回 null", async () => {
    const result = await repo.getAttachment("nonexistent");

    expect(result).toBeNull();
  });

  it("getAttachment 应能回退读取旧路径的附件", async () => {
    // 手动在旧路径写入附件数据: agents/conversations/attachments/{id}
    const attachDir = navigateDir(rootStore, "agents", "conversations", "attachments");
    attachDir.set("old-att", new Blob(["old path data"]));

    const result = await repo.getAttachment("old-att");

    expect(result).not.toBeNull();
    expect(result).toBeInstanceOf(Blob);
    const text = await result!.text();
    expect(text).toBe("old path data");
  });

  it("deleteAttachment 应删除已保存的附件", async () => {
    const blob = new Blob(["data"], { type: "text/plain" });
    await repo.saveAttachment("att-4", blob);

    await repo.deleteAttachment("att-4");

    const result = await repo.getAttachment("att-4");
    expect(result).toBeNull();
  });

  it("deleteAttachment 应同时清理新旧路径", async () => {
    // 在新路径保存
    await repo.saveAttachment("att-both", new Blob(["new"]));
    // 在旧路径也放一份
    const attachDir = navigateDir(rootStore, "agents", "conversations", "attachments");
    attachDir.set("att-both", new Blob(["old"]));

    await repo.deleteAttachment("att-both");

    // 新旧路径都应被清理
    const uploadsDir = navigateDir(rootStore, "agents", "workspace", "uploads");
    expect(uploadsDir.has("att-both")).toBe(false);
    expect(attachDir.has("att-both")).toBe(false);
  });

  it("deleteAttachments 应批量删除附件", async () => {
    await repo.saveAttachment("att-a", new Blob(["a"]));
    await repo.saveAttachment("att-b", new Blob(["b"]));
    await repo.saveAttachment("att-c", new Blob(["c"]));

    await repo.deleteAttachments(["att-a", "att-c"]);

    expect(await repo.getAttachment("att-a")).toBeNull();
    expect(await repo.getAttachment("att-b")).not.toBeNull();
    expect(await repo.getAttachment("att-c")).toBeNull();
  });

  it("saveAttachment 纯文本（非 data URL）应作为 octet-stream 存储", async () => {
    const size = await repo.saveAttachment("att-5", "plain text content");
    expect(size).toBeGreaterThan(0);
  });

  it("deleteConversation 应清理关联的附件", async () => {
    // 先保存会话和消息（含附件）
    const convId = "conv-1";
    await repo.saveConversation({
      id: convId,
      title: "Test",
      modelId: "m1",
      createtime: Date.now(),
      updatetime: Date.now(),
    });
    await repo.saveMessages(convId, [
      {
        id: "msg-1",
        conversationId: convId,
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "tc-1",
            name: "screenshot",
            arguments: "{}",
            attachments: [
              { id: "att-del-1", type: "image", name: "img.jpg", mimeType: "image/jpeg" },
              { id: "att-del-2", type: "file", name: "file.zip", mimeType: "application/zip" },
            ],
          },
        ],
        createtime: Date.now(),
      },
    ]);

    // 保存附件数据
    await repo.saveAttachment("att-del-1", new Blob(["img"]));
    await repo.saveAttachment("att-del-2", new Blob(["zip"]));

    // 删除会话
    await repo.deleteConversation(convId);

    // 附件应被清理
    expect(await repo.getAttachment("att-del-1")).toBeNull();
    expect(await repo.getAttachment("att-del-2")).toBeNull();
  });
});
