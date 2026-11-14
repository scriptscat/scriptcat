import EventEmitter from "eventemitter3";
import { describe, expect, it, vi } from "vitest";
import { MockMessage } from "@Packages/message/mock_message";
import { Server } from "@Packages/message/server";
import ValueUpdatePorts from "../service_worker/value_port";
import ScriptingValuePort from "./value_port";
import type { ValueUpdateDataEncoded } from "./types";

describe("scripting ↔ serviceWorker Port 通道", () => {
  it("实际消息 Server/Group 协议能完成订阅确认并精准传递 GM 更新", async () => {
    const transport = new MockMessage(new EventEmitter<string, unknown>());
    const server = new Server("serviceWorker", transport);
    const failures = vi.fn();
    const ports = new ValueUpdatePorts(failures, async (sub, register) => {
      register();
      return { storageName: sub.storageName, revision: sub.revision };
    });
    server.group("runtime").on("valueUpdates", (_, sender) => ports.connect(sender));
    const received = vi.fn();
    const channel = new ScriptingValuePort(transport, received, vi.fn());
    channel.start();

    await channel.subscribe(() => [{ storageName: "script-a", revision: 0, uuids: ["uuid-a"] }]);
    const update: ValueUpdateDataEncoded = {
      uuid: "uuid-a",
      storageName: "script-a",
      id: "set-1",
      entries: [],
      sender: { runFlag: "", tabId: 1 },
      valueUpdated: true,
    };
    ports.push("script-a", update);
    ports.push("script-b", { ...update, storageName: "script-b" });

    expect(received).toHaveBeenCalledExactlyOnceWith(update);
    expect(failures).not.toHaveBeenCalled();
    channel.stop();
    received.mockClear();
    ports.push("script-a", update);
    expect(received).not.toHaveBeenCalled();
  });
});
