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
      // 真实 OPFS 的 abort() 放弃这次写入的临时副本，不影响 dir 里已提交的旧内容
      abort: vi.fn(async () => {}),
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
          const forcedError = dir.get("__close_error__");
          if (forcedError) {
            dir.delete("__close_error__");
            throw forcedError;
          }
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
            throw new DOMException("A requested file or directory could not be found.", "NotFoundError");
          }
        }
        return createMockDirHandle(store.get("__dir__" + name));
      }),
      getFileHandle: vi.fn(async (name: string, opts?: { create?: boolean }) => {
        const forcedError = store.get("__get_error__");
        if (forcedError) throw forcedError;
        if (!store.has(name) && !opts?.create) {
          throw new DOMException("A requested file or directory could not be found.", "NotFoundError");
        }
        if (!store.has(name)) {
          store.set(name, "");
        }
        return createMockFileHandle(name, store);
      }),
      removeEntry: vi.fn(async (name: string) => {
        const forcedError = store.get("__remove_error__");
        if (forcedError) throw forcedError;
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

  it("附件读取与删除不得把权限错误伪装成不存在", async () => {
    const uploadsDir = navigateDir(rootStore, "agents", "workspace", "uploads");
    uploadsDir.set("__get_error__", new DOMException("read denied", "NotAllowedError"));
    await expect(repo.getAttachment("private.png")).rejects.toThrow("read denied");

    uploadsDir.delete("__get_error__");
    uploadsDir.set("__remove_error__", new DOMException("delete denied", "NotAllowedError"));
    await expect(repo.deleteAttachment("private.png")).rejects.toThrow("delete denied");
  });

  it("saveAttachment 纯文本（非 data URL）应作为 octet-stream 存储", async () => {
    const size = await repo.saveAttachment("att-5", "plain text content");
    expect(size).toBeGreaterThan(0);
  });

  it("附件 close 已提交后报错时应通过大小读回确认成功", async () => {
    const uploadsDir = navigateDir(rootStore, "agents", "workspace", "uploads");
    uploadsDir.set("__close_error__", new Error("ambiguous attachment close"));

    await expect(repo.saveAttachment("ambiguous.bin", new Blob(["durable"]))).resolves.toBe(7);
    expect(await (await repo.getAttachment("ambiguous.bin"))!.text()).toBe("durable");
  });

  it("deleteConversation 应清理关联的附件", async () => {
    // 先保存会话和消息（含附件）
    const convId = "conv-1";
    const conversation = await repo.createConversation({
      id: convId,
      title: "Test",
      modelId: "m1",
      createtime: Date.now(),
      updatetime: Date.now(),
    });
    await repo.saveMessages(
      convId,
      [
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
                { id: "att-borrowed", type: "image", name: "borrowed.jpg", mimeType: "image/jpeg" },
              ],
              ownedAttachmentIds: ["att-del-1", "att-del-2"],
            },
          ],
          createtime: Date.now(),
        },
        {
          id: "msg-borrowed",
          conversationId: convId,
          role: "user",
          content: [{ type: "image", attachmentId: "att-borrowed", mimeType: "image/jpeg" }],
          createtime: Date.now(),
        },
      ],
      undefined,
      { generation: conversation.generation! }
    );

    // 保存附件数据
    await repo.saveAttachment("att-del-1", new Blob(["img"]));
    await repo.saveAttachment("att-del-2", new Blob(["zip"]));
    await repo.saveAttachment("att-borrowed", new Blob(["borrowed"]));

    // 删除会话
    await repo.deleteConversation(convId, {
      generation: conversation.generation!,
      expectedRevision: conversation.revision,
    });

    // 附件应被清理
    expect(await repo.getAttachment("att-del-1")).toBeNull();
    expect(await repo.getAttachment("att-del-2")).toBeNull();
    expect(await repo.getAttachment("att-borrowed")).not.toBeNull();
  });

  it("替换历史时应递归清理被移除的子代理附件并保留仍被引用的附件", async () => {
    const conversation = await repo.createConversation({
      id: "conv-nested-attachments",
      title: "Test",
      modelId: "m1",
      createtime: 1,
      updatetime: 1,
    });
    const retained = {
      id: "keep",
      conversationId: conversation.id,
      role: "user" as const,
      content: [{ type: "image" as const, attachmentId: "att-keep", mimeType: "image/png" }],
      ownedAttachmentIds: ["att-keep"],
      createtime: 1,
    };
    const nested = {
      id: "nested",
      conversationId: conversation.id,
      role: "assistant" as const,
      content: "",
      toolCalls: [
        {
          id: "tool-1",
          name: "agent",
          arguments: "{}",
          ownedAttachmentIds: ["att-child", "att-child-tool"],
          subAgentDetails: {
            agentId: "child",
            description: "child",
            messages: [
              {
                content: [{ type: "image", attachmentId: "att-child", mimeType: "image/png" }],
                toolCalls: [
                  {
                    id: "child-tool",
                    name: "image_generation",
                    arguments: "{}",
                    attachments: [{ id: "att-child-tool", type: "image", name: "child.png", mimeType: "image/png" }],
                    ownedAttachmentIds: ["att-child-tool"],
                  },
                ],
              },
            ],
          },
        },
      ],
      createtime: 2,
    } as any;
    await repo.saveMessages(conversation.id, [retained, nested], undefined, {
      generation: conversation.generation!,
    });
    await Promise.all([
      repo.saveAttachment("att-keep", new Blob(["keep"])),
      repo.saveAttachment("att-child", new Blob(["child"])),
      repo.saveAttachment("att-child-tool", new Blob(["tool"])),
    ]);
    const snapshot = await repo.getMessageSnapshot(conversation.id, conversation.generation);

    await repo.saveMessages(conversation.id, [retained], undefined, {
      generation: conversation.generation!,
      expectedRevision: snapshot.revision,
    });

    expect(await repo.getAttachment("att-keep")).not.toBeNull();
    expect(await repo.getAttachment("att-child")).toBeNull();
    expect(await repo.getAttachment("att-child-tool")).toBeNull();
  });

  it("重新生成转移消息所有权时应暂时保留指定附件", async () => {
    const conversation = await repo.createConversation({
      id: "conv-transfer-attachment",
      title: "Test",
      modelId: "m1",
      createtime: 1,
      updatetime: 1,
    });
    await repo.saveMessages(
      conversation.id,
      [
        {
          id: "owned-user-message",
          conversationId: conversation.id,
          role: "user",
          content: [{ type: "image", attachmentId: "transfer.png", mimeType: "image/png" }],
          ownedAttachmentIds: ["transfer.png"],
          createtime: 1,
        },
      ],
      undefined,
      { generation: conversation.generation! }
    );
    await repo.saveAttachment("transfer.png", new Blob(["image"]));
    const snapshot = await repo.getMessageSnapshot(conversation.id, conversation.generation);

    await repo.saveMessages(conversation.id, [], undefined, {
      generation: conversation.generation!,
      expectedRevision: snapshot.revision,
      preserveAttachmentIds: ["transfer.png"],
    });

    expect(await repo.getAttachment("transfer.png")).not.toBeNull();
  });
});

describe("AgentChatRepo.saveMessages 取消安全", () => {
  let repo: AgentChatRepo;

  beforeEach(() => {
    createMockOPFS();
    repo = new AgentChatRepo();
  });

  it("signal 已 abort 时 saveMessages 应 reject 且不覆盖已持久化的旧消息", async () => {
    const convId = "conv-cancel";
    const conversation = await repo.createConversation({
      id: convId,
      title: "Test",
      modelId: "m1",
      createtime: Date.now(),
      updatetime: Date.now(),
    });
    const oldMessage = {
      id: "msg-old",
      conversationId: convId,
      role: "user" as const,
      content: "原始历史",
      createtime: Date.now(),
    };
    await repo.saveMessages(convId, [oldMessage], undefined, { generation: conversation.generation! });

    const controller = new AbortController();
    controller.abort();
    await expect(
      repo.saveMessages(convId, [{ ...oldMessage, id: "msg-new", content: "摘要覆盖" }], controller.signal)
    ).rejects.toThrow("Aborted");

    // 旧内容必须完整保留，没有被这次放弃的写入部分覆盖或破坏
    const stored = await repo.getMessages(convId);
    expect(stored).toEqual([oldMessage]);
  });
});

describe("AgentChatRepo 跨上下文读-改-写安全", () => {
  let repo: AgentChatRepo;
  let rootStore: Map<string, any>;

  beforeEach(() => {
    ({ rootStore } = createMockOPFS());
    repo = new AgentChatRepo();
  });

  it("并发 appendMessage 不应互相覆盖丢消息", async () => {
    const convId = "conv-race";
    const conversation = await repo.createConversation({
      id: convId,
      title: "Test",
      modelId: "m1",
      createtime: Date.now(),
      updatetime: Date.now(),
    });
    const makeMessage = (id: string) => ({
      id,
      conversationId: convId,
      role: "user" as const,
      content: id,
      createtime: Date.now(),
    });

    // 两个并发的读-改-写：无锁时双方都会读到空快照，后写者覆盖先写者
    await Promise.all([
      repo.appendMessage(makeMessage("m1"), conversation.generation),
      repo.appendMessage(makeMessage("m2"), conversation.generation),
    ]);

    const stored = await repo.getMessages(convId);
    expect(stored.map((m) => m.id).sort()).toEqual(["m1", "m2"]);
  });

  it("相同消息 ID 的持久化重试不应生成重复记录", async () => {
    const conversation = await repo.createConversation({
      id: "conv-idempotent",
      title: "Test",
      modelId: "m1",
      createtime: Date.now(),
      updatetime: Date.now(),
    });
    const message = {
      id: "stable-message",
      conversationId: conversation.id,
      role: "assistant" as const,
      content: "done",
      createtime: Date.now(),
    };

    await repo.appendMessage(message, conversation.generation);
    await repo.appendMessage(message, conversation.generation);

    expect((await repo.getMessages(conversation.id)).filter((item) => item.id === message.id)).toHaveLength(1);
  });

  it("appendMessage close 已提交后报错时应读回确认消息及附件所有权", async () => {
    const conversation = await repo.createConversation({
      id: "conv-ambiguous-append",
      title: "Test",
      modelId: "m1",
      createtime: 1,
      updatetime: 1,
    });
    const message = {
      id: "owned-message",
      conversationId: conversation.id,
      role: "user" as const,
      content: [{ type: "image" as const, attachmentId: "owned.png", mimeType: "image/png" }],
      ownedAttachmentIds: ["owned.png"],
      createtime: 2,
    };
    const originalWrite = (repo as any).writeJsonFile.bind(repo);
    vi.spyOn(repo as any, "writeJsonFile").mockImplementationOnce(async (...args: unknown[]) => {
      await originalWrite(...args);
      throw new Error("ambiguous append close");
    });

    await expect(repo.appendMessage(message, conversation.generation)).resolves.toMatchObject({
      messages: [message],
    });
  });

  it("saveTasks close 已提交后报错时应读回确认候选任务列表", async () => {
    const conversation = await repo.createConversation({
      id: "conv-ambiguous-tasks",
      title: "Test",
      modelId: "m1",
      createtime: 1,
      updatetime: 1,
    });
    const tasks = [{ id: "1", subject: "persist", status: "pending" as const }];
    const originalWrite = (repo as any).writeJsonFile.bind(repo);
    vi.spyOn(repo as any, "writeJsonFile").mockImplementationOnce(async (...args: unknown[]) => {
      await originalWrite(...args);
      throw new Error("ambiguous task close");
    });

    await expect(repo.saveTasks(conversation.id, tasks, undefined, conversation.generation)).resolves.toBeUndefined();
    await expect(repo.getTasks(conversation.id, conversation.generation)).resolves.toEqual(tasks);
  });

  it("saveMessages close 已提交后报错时仍应继续清理被移除附件", async () => {
    const conversation = await repo.createConversation({
      id: "conv-ambiguous-replace",
      title: "Test",
      modelId: "m1",
      createtime: 1,
      updatetime: 1,
    });
    await repo.saveMessages(
      conversation.id,
      [
        {
          id: "owned-old",
          conversationId: conversation.id,
          role: "user",
          content: [{ type: "image", attachmentId: "old.png", mimeType: "image/png" }],
          ownedAttachmentIds: ["old.png"],
          createtime: 1,
        },
      ],
      undefined,
      { generation: conversation.generation! }
    );
    await repo.saveAttachment("old.png", new Blob(["old"]));
    const snapshot = await repo.getMessageSnapshot(conversation.id, conversation.generation);
    const originalWrite = (repo as any).writeJsonFile.bind(repo);
    vi.spyOn(repo as any, "writeJsonFile").mockImplementationOnce(async (...args: unknown[]) => {
      await originalWrite(...args);
      throw new Error("ambiguous replacement close");
    });

    await expect(
      repo.saveMessages(conversation.id, [], undefined, {
        generation: conversation.generation!,
        expectedRevision: snapshot.revision,
      })
    ).resolves.toMatchObject({ messages: [] });
    expect(await repo.getAttachment("old.png")).toBeNull();
  });

  it("并发 saveConversation 不应互相覆盖丢会话", async () => {
    const makeConv = (id: string) => ({
      id,
      title: id,
      modelId: "m",
      createtime: Date.now(),
      updatetime: Date.now(),
    });

    await Promise.all([repo.createConversation(makeConv("c1")), repo.createConversation(makeConv("c2"))]);

    const stored = await repo.listConversations();
    expect(stored.map((c) => c.id).sort()).toEqual(["c1", "c2"]);
  });

  it("消息文件损坏时读取应抛错，而不是让后续写入基于空快照覆盖旧数据", async () => {
    const conversation = await repo.createConversation({
      id: "conv-corrupt",
      title: "Test",
      modelId: "m1",
      createtime: Date.now(),
      updatetime: Date.now(),
    });
    const messagesDir = navigateDir(rootStore, "agents", "conversations", "data");
    messagesDir.set("conv-corrupt.json", "{ 损坏的 JSON");

    await expect(repo.getMessages("conv-corrupt")).rejects.toThrow();
    // appendMessage 的读阶段同样必须失败，绝不能把损坏文件当作空历史整份覆写
    await expect(
      repo.appendMessage(
        {
          id: "m1",
          conversationId: "conv-corrupt",
          role: "user",
          content: "hi",
          createtime: Date.now(),
        },
        conversation.generation
      )
    ).rejects.toThrow();
    expect(messagesDir.get("conv-corrupt.json")).toBe("{ 损坏的 JSON");
  });

  it("文件尚未创建（NotFoundError）时读取返回默认值", async () => {
    await expect(repo.getMessages("conv-none")).resolves.toEqual([]);
  });

  it("支持 Web Locks 的环境下写操作应在 navigator.locks 排它锁内执行", async () => {
    const request = vi.fn(async (_name: string, _opts: unknown, fn: () => Promise<unknown>) => fn());
    Object.defineProperty(navigator, "locks", {
      value: { request },
      configurable: true,
      writable: true,
    });
    try {
      const conversation = await repo.createConversation({
        id: "conv-lock",
        title: "Test",
        modelId: "m1",
        createtime: Date.now(),
        updatetime: Date.now(),
      });
      await repo.appendMessage(
        {
          id: "m1",
          conversationId: "conv-lock",
          role: "user",
          content: "hi",
          createtime: Date.now(),
        },
        conversation.generation
      );
      expect(request).toHaveBeenCalledWith(
        expect.stringContaining("conv-lock"),
        expect.objectContaining({ mode: "exclusive" }),
        expect.any(Function)
      );
    } finally {
      // @ts-expect-error 清理测试注入的 locks
      delete navigator.locks;
    }
  });

  it("删除后延迟的元数据和消息写入都不应复活旧 generation", async () => {
    const conversation = await repo.createConversation({
      id: "conv-deleted",
      title: "Test",
      modelId: "m1",
      createtime: Date.now(),
      updatetime: Date.now(),
    });
    await repo.deleteConversation(conversation.id, {
      generation: conversation.generation!,
      expectedRevision: conversation.revision,
    });

    conversation.title = "stale rename";
    await expect(repo.saveConversation(conversation)).rejects.toThrow("deleted");
    await expect(
      repo.appendMessage(
        {
          id: "late",
          conversationId: conversation.id,
          role: "assistant",
          content: "late",
          createtime: Date.now(),
        },
        conversation.generation
      )
    ).rejects.toThrow("deleted");
    expect(await repo.listConversations()).toEqual([]);
    expect(await repo.getMessages(conversation.id)).toEqual([]);
  });

  it("会话元数据删除已提交后 close 报错时仍应完成子数据清理", async () => {
    const conversation = await repo.createConversation({
      id: "conv-ambiguous-delete",
      title: "Test",
      modelId: "m1",
      createtime: 1,
      updatetime: 1,
    });
    await repo.saveMessages(
      conversation.id,
      [
        {
          id: "owned-before-delete",
          conversationId: conversation.id,
          role: "user",
          content: [{ type: "image", attachmentId: "delete-me.png", mimeType: "image/png" }],
          ownedAttachmentIds: ["delete-me.png"],
          createtime: 1,
        },
      ],
      undefined,
      { generation: conversation.generation! }
    );
    await repo.saveAttachment("delete-me.png", new Blob(["delete"]));
    const originalWrite = (repo as any).writeJsonFile.bind(repo);
    vi.spyOn(repo as any, "writeJsonFile").mockImplementationOnce(async (...args: unknown[]) => {
      await originalWrite(...args);
      throw new Error("ambiguous delete close");
    });

    await expect(
      repo.deleteConversation(conversation.id, {
        generation: conversation.generation!,
        expectedRevision: conversation.revision,
      })
    ).resolves.toBeUndefined();
    expect(await repo.listConversations()).toEqual([]);
    expect(await repo.getAttachment("delete-me.png")).toBeNull();
  });

  it("deleteConversation 的附件/消息 GC 真正失败时仍应报告删除成功", async () => {
    const conversation = await repo.createConversation({
      id: "conv-gc-fail-delete",
      title: "Test",
      modelId: "m1",
      createtime: 1,
      updatetime: 1,
    });
    vi.spyOn(repo, "deleteAttachments").mockRejectedValueOnce(new Error("disk error"));

    // 元数据删除本身（主提交）已经完成，附件/消息清理失败只是 GC 债务，不应报告整个删除失败
    await expect(
      repo.deleteConversation(conversation.id, {
        generation: conversation.generation!,
        expectedRevision: conversation.revision,
      })
    ).resolves.toBeUndefined();
    expect(await repo.listConversations()).toEqual([]);
  });

  it("createConversation 复用 ID 时旧数据清理失败不应报告创建失败", async () => {
    const original = await repo.createConversation({
      id: "conv-reused",
      title: "Old",
      modelId: "m1",
      createtime: 1,
      updatetime: 1,
    });
    // 先正常删除，留下同 id 可被复用；被删除的旧一代消息/任务文件在真实场景里可能残留
    await repo.deleteConversation("conv-reused", {
      generation: original.generation!,
      expectedRevision: original.revision,
    });
    vi.spyOn(repo as any, "deleteFile").mockRejectedValue(new Error("disk error"));

    // 复用 id 时旧一代的消息/任务文件清理失败仅是 GC 债务；conversations.json 的插入才是主提交
    const recreated = await repo.createConversation({
      id: "conv-reused",
      title: "New",
      modelId: "m1",
      createtime: 2,
      updatetime: 2,
    });
    expect(recreated.id).toBe("conv-reused");
    const list = await repo.listConversations();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("New");
  });

  it("会话 ID 复用且旧任务文件清理失败时，getTasks 不应读到上一代的任务", async () => {
    const original = await repo.createConversation({
      id: "conv-task-reused",
      title: "Old",
      modelId: "m1",
      createtime: 1,
      updatetime: 1,
    });
    await repo.saveTasks(
      original.id,
      [{ id: "task-1", title: "旧一代任务", status: "pending" } as any],
      undefined,
      original.generation
    );
    // 删除会话本身成功，但旧任务文件的清理失败（GC 债务），文件残留在磁盘上
    vi.spyOn(repo as any, "deleteFile").mockRejectedValue(new Error("disk error"));
    await repo.deleteConversation("conv-task-reused", {
      generation: original.generation!,
      expectedRevision: original.revision,
    });

    // 复用同一个 ID 创建新一代会话
    const recreated = await repo.createConversation({
      id: "conv-task-reused",
      title: "New",
      modelId: "m1",
      createtime: 2,
      updatetime: 2,
    });
    expect(recreated.generation).not.toBe(original.generation);

    // 新一代会话读取任务时不应看到残留的旧一代任务，而应得到空列表
    const tasks = await repo.getTasks(recreated.id, recreated.generation);
    expect(tasks).toEqual([]);
  });

  it("saveMessages 提交新快照后附件 GC 失败不应报告 clear/compact 失败", async () => {
    const conversation = await repo.createConversation({
      id: "conv-gc-fail-save",
      title: "Test",
      modelId: "m1",
      createtime: 1,
      updatetime: 1,
    });
    await repo.saveMessages(
      conversation.id,
      [
        {
          id: "msg-with-attachment",
          conversationId: conversation.id,
          role: "user",
          content: [{ type: "image", attachmentId: "removed.png", mimeType: "image/png" }],
          ownedAttachmentIds: ["removed.png"],
          createtime: 1,
        },
      ],
      undefined,
      { generation: conversation.generation! }
    );
    vi.spyOn(repo, "deleteAttachments").mockRejectedValueOnce(new Error("disk error"));

    // 新的（空）快照已经提交；被移除消息引用的附件清理失败不应让 clear 报告失败
    const saved = await repo.saveMessages(conversation.id, [], undefined, { generation: conversation.generation! });
    expect(saved.messages).toEqual([]);
    expect(await repo.getMessages(conversation.id)).toEqual([]);
  });

  it("升级前的历史会话（legacy generation）删除时应按 content block 推断清理旧附件", async () => {
    // 直接写入没有 generation/revision 字段的会话记录，模拟所有权模型引入之前创建的历史数据
    await (repo as any).writeJsonFile("conversations.json", [
      { id: "conv-legacy-del", title: "Test", modelId: "m1", createtime: 1, updatetime: 1 },
    ]);
    const [conv] = await repo.listConversations();
    expect(conv.generation).toBe("legacy:conv-legacy-del");

    // 历史消息只有 content block 引用附件，从未写入过 ownedAttachmentIds（该字段是本次新增的）
    await repo.saveMessages(
      conv.id,
      [
        {
          id: "legacy-msg",
          conversationId: conv.id,
          role: "user",
          content: [{ type: "image", attachmentId: "legacy-owned.png", mimeType: "image/png" }],
          createtime: 1,
        },
      ],
      undefined,
      { generation: conv.generation! }
    );
    await repo.saveAttachment("legacy-owned.png", new Blob(["legacy"]));

    await repo.deleteConversation(conv.id, { generation: conv.generation!, expectedRevision: conv.revision });

    // 升级前的历史必须能按 content block 推断出所有权，否则这类附件永远不会被清理
    expect(await repo.getAttachment("legacy-owned.png")).toBeNull();
  });

  it("非 legacy 会话中未声明所有权的 content block 引用应保持借用语义，不因清理被误删", async () => {
    const conversation = await repo.createConversation({
      id: "conv-current-borrow",
      title: "Test",
      modelId: "m1",
      createtime: 1,
      updatetime: 1,
    });
    await repo.saveMessages(
      conversation.id,
      [
        {
          id: "msg-borrowed",
          conversationId: conversation.id,
          role: "user",
          // 当前模型下 undefined ownedAttachmentIds 合法地表示"借用"，不代表遗留数据
          content: [{ type: "image", attachmentId: "shared.png", mimeType: "image/png" }],
          createtime: 1,
        },
      ],
      undefined,
      { generation: conversation.generation! }
    );
    await repo.saveAttachment("shared.png", new Blob(["shared"]));

    // 用一次空快照替换（模拟 clear）：借用引用不应被当作该会话的"已拥有附件"而删除
    await repo.saveMessages(conversation.id, [], undefined, { generation: conversation.generation! });

    expect(await repo.getAttachment("shared.png")).not.toBeNull();
  });

  it("历史替换应以 revision 做 CAS，不能覆盖并发追加", async () => {
    const conversation = await repo.createConversation({
      id: "conv-cas",
      title: "Test",
      modelId: "m1",
      createtime: Date.now(),
      updatetime: Date.now(),
    });
    await repo.appendMessage(
      { id: "m1", conversationId: conversation.id, role: "user", content: "old", createtime: 1 },
      conversation.generation
    );
    const stale = await repo.getMessageSnapshot(conversation.id, conversation.generation);
    await repo.appendMessage(
      { id: "m2", conversationId: conversation.id, role: "assistant", content: "fresh", createtime: 2 },
      conversation.generation
    );

    await expect(
      repo.saveMessages(conversation.id, [], undefined, {
        generation: conversation.generation!,
        expectedRevision: stale.revision,
      })
    ).rejects.toThrow("changed");
    expect((await repo.getMessages(conversation.id)).map((message) => message.id)).toEqual(["m1", "m2"]);
  });

  it("工具调用 assistant 与全部 tool 结果应在一次历史 revision 中提交", async () => {
    const conversation = await repo.createConversation({
      id: "conv-tool-round",
      title: "Test",
      modelId: "m1",
      createtime: 1,
      updatetime: 1,
    });
    const before = await repo.getMessageSnapshot(conversation.id, conversation.generation);
    await repo.commitToolRound(
      {
        id: "assistant",
        conversationId: conversation.id,
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "call-1", name: "one", arguments: "{}", status: "completed" },
          { id: "call-2", name: "two", arguments: "{}", status: "error" },
        ],
        createtime: 1,
      },
      [
        {
          id: "tool-1",
          conversationId: conversation.id,
          role: "tool",
          content: "ok",
          toolCallId: "call-1",
          createtime: 2,
        },
        {
          id: "tool-2",
          conversationId: conversation.id,
          role: "tool",
          content: "failed",
          toolCallId: "call-2",
          createtime: 3,
        },
      ],
      conversation.generation
    );

    const after = await repo.getMessageSnapshot(conversation.id, conversation.generation);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.messages.map((message) => message.id)).toEqual(["assistant", "tool-1", "tool-2"]);
  });

  it("工具轮次 close 报错但读回确认完整时应按已提交成功处理", async () => {
    const conversation = await repo.createConversation({
      id: "conv-ambiguous-tool-round",
      title: "Test",
      modelId: "m1",
      createtime: 1,
      updatetime: 1,
    });
    const assistant = {
      id: "assistant-ambiguous",
      conversationId: conversation.id,
      role: "assistant" as const,
      content: "",
      toolCalls: [{ id: "call-1", name: "tool", arguments: "{}" }],
      createtime: 2,
    };
    const toolMessage = {
      id: "tool-ambiguous",
      conversationId: conversation.id,
      role: "tool" as const,
      content: "done",
      toolCallId: "call-1",
      createtime: 3,
    };
    const originalWrite = (repo as any).writeJsonFile.bind(repo);
    vi.spyOn(repo as any, "writeJsonFile").mockImplementationOnce(async (...args: unknown[]) => {
      await originalWrite(...args);
      throw new Error("ambiguous close failure");
    });

    await expect(repo.commitToolRound(assistant, [toolMessage], conversation.generation)).resolves.toMatchObject({
      messages: [assistant, toolMessage],
    });
  });
});
