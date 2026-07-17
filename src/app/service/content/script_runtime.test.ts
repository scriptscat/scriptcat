import { describe, expect, it, vi } from "vitest";
import EventEmitter from "eventemitter3";
import { MockMessage } from "@Packages/message/mock_message";
import { Server } from "@Packages/message/server";
import { ScriptEnvTag } from "@Packages/message/consts";
import { ScriptRuntime } from "./script_runtime";

describe("ScriptRuntime 内容脚本导航", () => {
  it("收到 historyBack 消息时应在内容脚本上下文回退历史记录", () => {
    const historyBack = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const emitter = new EventEmitter<string, any>();
    const server = new Server("content", new MockMessage(emitter));
    const runtime = new ScriptRuntime(ScriptEnvTag.content, server, {} as never, {} as never, undefined);

    runtime.contentInit();
    emitter.emit("message", { action: "content/historyBack" }, () => {}, {});

    expect(historyBack).toHaveBeenCalledOnce();
    historyBack.mockRestore();
  });
});
