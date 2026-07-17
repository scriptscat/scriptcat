import EventEmitter from "eventemitter3";
import { describe, expect, it, vi } from "vitest";
import { MockMessage } from "@Packages/message/mock_message";
import { SenderRuntime, Server } from "@Packages/message/server";
import MessageWriter from "./message_writer";

describe("MessageWriter 页面日志路由", () => {
  it("页面调用方应将日志发送到 service worker 的 logger 处理器", () => {
    const message = new MockMessage(new EventEmitter());
    const handler = vi.fn();
    const server = new Server("serviceWorker", message, false);
    server.on("logger", handler);
    const writer = MessageWriter.serviceWorker(message);

    writer.write("info", "page message", { env: "options" });

    expect(handler).toHaveBeenCalledWith(
      {
        id: 0,
        level: "info",
        message: "page message",
        label: { env: "options" },
        createtime: expect.any(Number),
      },
      expect.any(SenderRuntime)
    );
  });
});
