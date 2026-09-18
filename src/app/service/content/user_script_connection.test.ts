import { describe, expect, it, vi } from "vitest";
import type { Message, MessageConnect, TMessage } from "@Packages/message/types";
import { connectUserScriptChannel, requestUserScriptReconnect } from "./user_script_connection";

const makeConnection = (): MessageConnect => ({
  onMessage: vi.fn(),
  sendMessage: vi.fn(),
  disconnect: vi.fn(),
  onDisconnect: vi.fn(),
});

describe("connectUserScriptChannel", () => {
  it("enables the native listener before opening the USER_SCRIPT port", async () => {
    const connection = makeConnection();
    const order: string[] = [];
    const message = {
      sendMessage: vi.fn(async (packet: TMessage) => {
        order.push(`send:${(packet as { type?: string }).type}`);
        return true;
      }),
      connect: vi.fn(async (packet: TMessage) => {
        order.push(`connect:${packet.action}`);
        return connection;
      }),
    } as unknown as Message;

    await connectUserScriptChannel(message, "bootstrap-token", vi.fn());

    expect(order).toEqual(["send:userScripts.LISTEN_CONNECTIONS", "connect:serviceWorker/runtime/registerUserScript"]);
    expect(connection.onMessage).toHaveBeenCalledOnce();
    expect(connection.sendMessage).toHaveBeenCalledWith({ action: "userScript/bootstrap" });
  });

  it("preserves the MAIN world identity when opening the inject port", async () => {
    const connection = makeConnection();
    const message = {
      sendMessage: vi.fn().mockResolvedValue(true),
      connect: vi.fn().mockResolvedValue(connection),
    } as unknown as Message;

    await connectUserScriptChannel(message, "inject-bootstrap", vi.fn(), undefined, "MAIN");

    expect(message.connect).toHaveBeenCalledWith({
      action: "serviceWorker/runtime/registerUserScript",
      data: { world: "MAIN", bootstrapToken: "inject-bootstrap" },
    });
  });

  it("does not open a port when the browser cannot enable USER_SCRIPT listeners", async () => {
    const message = {
      sendMessage: vi.fn().mockResolvedValue(false),
      connect: vi.fn(),
    } as unknown as Message;

    await expect(connectUserScriptChannel(message, "bootstrap-token", vi.fn())).resolves.toBeUndefined();
    expect(message.connect).not.toHaveBeenCalled();
  });

  it("reports remote disconnects so the caller can reconnect natively", async () => {
    const connection = makeConnection();
    const onDisconnect = vi.fn();
    const message = {
      sendMessage: vi.fn().mockResolvedValue(true),
      connect: vi.fn().mockResolvedValue(connection),
    } as unknown as Message;

    await connectUserScriptChannel(message, "bootstrap-token", vi.fn(), onDisconnect);

    expect(connection.onDisconnect).toHaveBeenCalledOnce();
    const disconnectHandler = (connection.onDisconnect as ReturnType<typeof vi.fn>).mock.calls[0][0] as (
      isSelfDisconnected: boolean
    ) => void;
    disconnectHandler(false);
    expect(onDisconnect).toHaveBeenCalledWith(false);
  });

  it("accepts only a valid native reconnect token response", async () => {
    const message = {
      sendMessage: vi.fn().mockResolvedValue({ code: 0, data: { bootstrapToken: "next-token" } }),
    } as unknown as Message;

    await expect(requestUserScriptReconnect(message, "current-token")).resolves.toBe("next-token");
    expect(message.sendMessage).toHaveBeenCalledWith({
      action: "serviceWorker/runtime/reconnectUserScript",
      data: { reconnectToken: "current-token" },
    });

    (message.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ code: 0, data: {} });
    await expect(requestUserScriptReconnect(message, "current-token")).resolves.toBeUndefined();
  });
});
