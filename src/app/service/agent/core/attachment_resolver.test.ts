import { describe, expect, it, vi } from "vitest";
import { prepareAttachmentSnapshot } from "./attachment_resolver";
import type { AgentModelConfig, ChatRequest } from "./types";

const MODEL: AgentModelConfig = {
  id: "vision",
  name: "Vision",
  provider: "openai",
  apiBaseUrl: "",
  apiKey: "",
  model: "gpt-4o",
};

const MESSAGES: ChatRequest["messages"] = [
  { role: "user", content: [{ type: "image", attachmentId: "image-1", mimeType: "image/png" }] },
];

describe("附件请求快照", () => {
  it("预检大小与 provider payload 应复用同一次不可变读取", async () => {
    const getAttachment = vi
      .fn()
      .mockResolvedValueOnce(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }))
      .mockResolvedValueOnce(new Blob([new Uint8Array(1_000_000)], { type: "image/png" }));

    const snapshot = await prepareAttachmentSnapshot(MESSAGES, MODEL, getAttachment);

    expect(getAttachment).toHaveBeenCalledOnce();
    expect(snapshot.sizes.get("image-1")?.bytes).toBe(3);
    expect(snapshot.resolver("image-1")).toContain("AQID");
  });

  it("Stop 应中断正在进行的附件读取且不继续构建 payload", async () => {
    const deferred = new Promise<ArrayBuffer>(() => {});
    const blob = { size: 3, type: "image/png", arrayBuffer: () => deferred } as Blob;
    const controller = new AbortController();
    const pending = prepareAttachmentSnapshot(MESSAGES, MODEL, vi.fn().mockResolvedValue(blob), controller.signal);

    await Promise.resolve();
    controller.abort();

    await expect(pending).rejects.toThrow("Aborted");
  });

  it("Stop 应立即中断尚未完成的 OPFS 附件查询", async () => {
    const controller = new AbortController();
    const pending = prepareAttachmentSnapshot(
      MESSAGES,
      MODEL,
      vi.fn().mockReturnValue(new Promise<Blob>(() => {})),
      controller.signal
    );

    controller.abort();

    await expect(pending).rejects.toThrow("Aborted");
  });
});
