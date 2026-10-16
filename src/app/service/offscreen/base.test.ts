import { describe, it, expect, vi } from "vitest";
import { initTestEnv } from "@Tests/utils";
import { MockMessage } from "@Packages/message/mock_message";
import { Server } from "@Packages/message/server";
import EventEmitter from "eventemitter3";
import type { SandboxChannelHost } from "@Packages/message/sandbox_message_channel";
import type { ServiceWorkerClient } from "../service_worker/client";
import type {
  MessageConnect,
  MessageSend,
  OnConnectCallback,
  OnMessageCallback,
  TMessage,
} from "@Packages/message/types";
import { BackgroundEnvManagerBase } from "./base";
import { MessageQueueGroup, type IMessageQueue } from "@Packages/message/message_queue";
import { SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_BACKGROUND, type ScriptRunResource } from "@App/app/repo/scripts";

initTestEnv();

class LocalMessageQueue implements IMessageQueue {
  private readonly events = new EventEmitter<string, any>();

  group(name: string, middleware?: Parameters<IMessageQueue["group"]>[1]) {
    return new MessageQueueGroup(this, name, middleware);
  }

  subscribe<T>(topic: string, handler: (message: T) => void) {
    this.events.on(topic, handler);
    return () => this.events.off(topic, handler);
  }

  publish<T>(topic: string, message: NonNullable<T>) {
    this.events.emit(topic, message);
  }

  emit<T>(topic: string, message: NonNullable<T>) {
    this.events.emit(topic, message);
  }
}

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const makeSandboxChannel = (readyPromise: Promise<void>) => {
  const sendMessage = vi.fn(async (_message: TMessage) => ({ code: 0 }));
  return {
    ready: () => readyPromise,
    isReady: vi.fn(),
    connect: vi.fn(async (_message: TMessage) => ({}) as MessageConnect),
    sendMessage,
    onConnect: vi.fn((_callback: OnConnectCallback) => {}),
    onMessage: vi.fn((_callback: OnMessageCallback) => {}),
  } as unknown as SandboxChannelHost;
};

describe("BackgroundEnvManagerBase private sandbox readiness", () => {
  it("does not notify the service worker until the private port is attached", async () => {
    const bus = new MockMessage(new EventEmitter<string, any>());
    const offscreenServer = new Server("offscreen", bus);
    const ready = deferred();
    const sandboxChannel = makeSandboxChannel(ready.promise);
    const preparationOffscreen = vi.fn().mockResolvedValue(undefined);
    const manager = new BackgroundEnvManagerBase(
      { connect: vi.fn(), sendMessage: vi.fn() } as unknown as MessageSend,
      sandboxChannel,
      offscreenServer,
      { preparationOffscreen } as unknown as ServiceWorkerClient
    );

    const initialized = manager.initManager();
    await Promise.resolve();

    expect(preparationOffscreen).not.toHaveBeenCalled();

    ready.resolve();
    await initialized;

    expect(preparationOffscreen).toHaveBeenCalledTimes(1);
    expect(preparationOffscreen).toHaveBeenCalledWith({ verified: true });
  });

  it("replays background scripts and language only after MessagePort readiness", async () => {
    const bus = new MockMessage(new EventEmitter<string, any>());
    const offscreenServer = new Server("offscreen", bus);
    const ready = deferred();
    const messageQueue = new LocalMessageQueue();
    const backgroundScript = {
      uuid: "background-script",
      name: "background-script",
      type: SCRIPT_TYPE_BACKGROUND,
      status: SCRIPT_STATUS_ENABLE,
    } as ScriptRunResource;
    const extMsgSender = {
      connect: vi.fn(),
      sendMessage: vi.fn(async (message: TMessage) => {
        if (message.action === "serviceWorker/script/fetchInfo") {
          return { code: 0, data: backgroundScript };
        }
        if (message.action === "serviceWorker/script/getScriptRunResourceByUUID") {
          return { code: 0, data: backgroundScript };
        }
        return { code: 0 };
      }),
    } as unknown as MessageSend;
    const sandboxChannel = makeSandboxChannel(ready.promise);
    const sandboxSend = vi.mocked(sandboxChannel.sendMessage);
    const preparationOffscreen = vi.fn(async () => {
      messageQueue.publish("enableScripts", [{ uuid: backgroundScript.uuid, enable: true }]);
      messageQueue.publish("setSandboxLanguage", "zh-CN");
    });
    const manager = new BackgroundEnvManagerBase(
      extMsgSender,
      sandboxChannel,
      offscreenServer,
      { preparationOffscreen } as unknown as ServiceWorkerClient,
      messageQueue
    );

    const initialized = manager.initManager();
    await Promise.resolve();
    expect(sandboxSend).not.toHaveBeenCalled();

    ready.resolve();
    await initialized;
    for (let i = 0; i < 8; i += 1) await Promise.resolve();

    const actions = sandboxSend.mock.calls.map(([message]) => message.action);
    expect(actions).toContain("sandbox/enableScript");
    expect(actions).toContain("sandbox/setSandboxLanguage");
    expect(preparationOffscreen).toHaveBeenCalledTimes(1);
  });
});
