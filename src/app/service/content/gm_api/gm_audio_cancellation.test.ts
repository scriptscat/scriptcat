import { describe, expect, it, vi } from "vitest";
import EventEmitter from "eventemitter3";
import type { ScriptRunResource } from "@App/app/repo/scripts";
import { MockMessageConnect } from "@Packages/message/mock_message";
import type { Message, TMessage } from "@Packages/message/types";
import GMApi from "./gm_api";

const createPendingAudioApi = () => {
  const connection = new MockMessageConnect(new EventEmitter<string, TMessage>());
  const connect = vi.fn(async () => connection);
  const message = { connect } as unknown as Message;
  const api = new GMApi("serviceWorker", message, message, {
    uuid: "gm-audio-cancellation-test",
    value: {},
  } as ScriptRunResource);
  return { api, connect, connection };
};

describe("GM_audio pending registration cancellation", () => {
  it("rejects when the connection is already closed before registration setup", async () => {
    const connection = new MockMessageConnect(new EventEmitter<string, TMessage>());
    const connect = vi.fn(async () => connection);
    const message = { connect } as unknown as Message;
    const api = new GMApi("serviceWorker", message, message, {
      uuid: "gm-audio-closed-connection-test",
      value: {},
    } as ScriptRunResource);
    const listener = vi.fn();
    connection.disconnect();

    const registration = api["GM.audio.addStateChangeListener"](listener);
    const result = await Promise.race([
      registration.then(
        () => "resolved",
        (error) => `rejected:${String(error)}`
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), 0)),
    ]);

    expect(result).toBe("rejected:GM_audio.addStateChangeListener: Connection disconnected");
  });

  it("resolves pending registration immediately when the context is invalidated", async () => {
    let resolveConnection!: (connection: MockMessageConnect) => void;
    const connectionPromise = new Promise<MockMessageConnect>((resolve) => {
      resolveConnection = resolve;
    });
    const connect = vi.fn(() => connectionPromise);
    const message = { connect } as unknown as Message;
    const api = new GMApi("serviceWorker", message, message, {
      uuid: "gm-audio-context-invalidation-test",
      value: {},
    } as ScriptRunResource);
    const listener = vi.fn();

    const registration = api["GM.audio.addStateChangeListener"](listener);
    api.setInvalidContext();
    const result = await Promise.race([
      registration.then(
        () => "resolved",
        (error) => `rejected:${String(error)}`
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), 0)),
    ]);

    expect(result).toBe("resolved");

    const connection = new MockMessageConnect(new EventEmitter<string, TMessage>());
    resolveConnection(connection);
    await Promise.resolve();
    expect(connection.EE).toBeNull();
  });

  it("resolves the Promise API when the last listener is removed before registered", async () => {
    const { api, connect, connection } = createPendingAudioApi();
    const listener = vi.fn();
    const disconnect = vi.spyOn(connection, "disconnect");

    const registration = api["GM.audio.addStateChangeListener"](listener);
    await Promise.resolve();

    await api["GM.audio.removeStateChangeListener"](listener);
    await expect(registration).resolves.toBeUndefined();
    await Promise.resolve();

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("invokes the callback API once when removed before registered", async () => {
    const { api, connect, connection } = createPendingAudioApi();
    const listener = vi.fn();
    const registered = vi.fn();
    const disconnect = vi.spyOn(connection, "disconnect");

    api["GM_audio.addStateChangeListener"](listener, registered);
    await Promise.resolve();

    await new Promise<void>((resolve) => {
      api["GM_audio.removeStateChangeListener"](listener, resolve);
    });
    await Promise.resolve();

    expect(registered).toHaveBeenCalledTimes(1);
    // 与 setMute/getState/addStateChangeListener 等其余成功路径一致：不带参数调用回调
    // （GMTypes.AudioErrorCallback 的 error 为可选参数，无参调用与显式传入 undefined 等价）
    expect(registered).toHaveBeenCalledWith();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
