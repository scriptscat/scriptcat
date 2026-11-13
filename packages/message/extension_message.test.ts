import { afterEach, describe, expect, it, vi } from "vitest";
import { ExtensionContentMessageSend } from "./extension_message";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ExtensionContentMessageSend.notify", () => {
  // 回调形式下接收端不回包，Chrome 会报 lastError「The message port closed before a response was received」；
  // Promise 形式则正常 resolve（Chrome 156 实测），所以单向通知不能带回调
  it("不带回调发送，并把定向选项原样交给 tabs.sendMessage", async () => {
    const spy = vi.spyOn(chrome.tabs, "sendMessage");
    const msg = { action: "scripting/runtime/valueUpdates", data: [] };

    await expect(new ExtensionContentMessageSend(7, { frameId: 0, documentId: "doc" }).notify(msg)).resolves.toBe(
      undefined
    );
    await new ExtensionContentMessageSend(8).notify(msg);

    expect(spy.mock.calls).toEqual([
      [7, msg, { frameId: 0, documentId: "doc" }],
      [8, msg],
    ]);
  });

  it("接收端不存在时以浏览器的错误拒绝", async () => {
    const error = new Error("Could not establish connection. Receiving end does not exist.");
    vi.spyOn(chrome.tabs, "sendMessage").mockImplementation((() => Promise.reject(error)) as never);

    await expect(new ExtensionContentMessageSend(7).notify({ action: "a" })).rejects.toBe(error);
  });
});
