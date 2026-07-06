import { describe, expect, it, vi } from "vitest";
import EventEmitter from "eventemitter3";
import type { ScriptRunResource } from "@App/app/repo/scripts";
import { MockMessageConnect } from "@Packages/message/mock_message";
import type { Message, TMessage } from "@Packages/message/types";
import GMApi from "./gm_api";

const audioState: GMTypes.AudioState = {
  isMuted: true,
  muteReason: "extension",
  isAudible: false,
};

const createAudioApi = () => {
  const connection = new MockMessageConnect(new EventEmitter<string, TMessage>());
  const sendMessage = vi.fn<(message: TMessage) => Promise<TMessage>>(async (message: TMessage) => {
    const action = message.data.params[0];
    if (action === "getState") {
      return { code: 0, data: audioState };
    }
    return { code: 0 };
  });
  const connect = vi.fn(async () => connection);
  const message = { sendMessage, connect } as unknown as Message;
  const api = new GMApi("serviceWorker", message, message, {
    uuid: "gm-audio-test",
    value: {},
  } as ScriptRunResource);
  return { api, connect, connection, sendMessage };
};

describe("GM_audio 回调接口", () => {
  it("设置静音成功或失败时以 TM 格式调用回调", async () => {
    const { api, sendMessage } = createAudioApi();
    const success = vi.fn();

    await new Promise<void>((resolve) => {
      api["GM_audio.setMute"]({ isMuted: true }, (error) => {
        success(error);
        resolve();
      });
    });
    expect(success).toHaveBeenCalledWith(undefined);
    expect(sendMessage.mock.calls[0][0].data.params).toEqual(["setMute", { isMuted: true }]);

    sendMessage.mockResolvedValueOnce({ code: -1, message: "静音失败" });
    const failure = vi.fn();
    await new Promise<void>((resolve) => {
      api["GM_audio.setMute"]({ isMuted: false }, (error) => {
        failure(error);
        resolve();
      });
    });
    expect(failure).toHaveBeenCalledWith("静音失败");
  });

  it("读取状态成功时传入状态，失败时传入 undefined", async () => {
    const { api, sendMessage } = createAudioApi();
    const success = vi.fn();

    await new Promise<void>((resolve) => {
      api["GM_audio.getState"]((state) => {
        success(state);
        resolve();
      });
    });
    expect(success).toHaveBeenCalledWith(audioState);

    sendMessage.mockResolvedValueOnce({ code: -1, message: "读取失败" });
    const failure = vi.fn();
    await new Promise<void>((resolve) => {
      api["GM_audio.getState"]((state) => {
        failure(state);
        resolve();
      });
    });
    expect(failure).toHaveBeenCalledWith(undefined);
  });
});

describe("GM.audio Promise 接口", () => {
  it("设置静音与读取状态均返回 Promise", async () => {
    const { api, sendMessage } = createAudioApi();

    await expect(api["GM.audio.setMute"]({ isMuted: false })).resolves.toBeUndefined();
    await expect(api["GM.audio.getState"]()).resolves.toEqual(audioState);
    expect(sendMessage.mock.calls.map(([message]) => message.data.params)).toEqual([
      ["setMute", { isMuted: false }],
      ["getState"],
    ]);
  });
});

describe("GM_audio 状态变化监听", () => {
  it("多个监听器共享连接，并按原函数移除且在最后一个移除时断连", async () => {
    const { api, connect, connection } = createAudioApi();
    const first = vi.fn();
    const second = vi.fn();

    const firstRegistration = api["GM.audio.addStateChangeListener"](first);
    await Promise.resolve();
    connection.sendMessage({ action: "registered" });
    await firstRegistration;
    await api["GM.audio.addStateChangeListener"](second);

    connection.sendMessage({ action: "stateChange", data: { muted: "user", audible: true } });
    expect(first).toHaveBeenCalledWith({ muted: "user", audible: true });
    expect(second).toHaveBeenCalledWith({ muted: "user", audible: true });
    expect(connect).toHaveBeenCalledTimes(1);

    await api["GM.audio.removeStateChangeListener"](first);
    connection.sendMessage({ action: "stateChange", data: { audible: false } });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);

    const disconnect = vi.spyOn(connection, "disconnect");
    await api["GM.audio.removeStateChangeListener"](second);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("回调风格在注册成功后回调，注册失败时回传错误字符串", async () => {
    const { api, connection } = createAudioApi();
    const listener = vi.fn();
    const registered = vi.fn();

    const registration = new Promise<void>((resolve) => {
      api["GM_audio.addStateChangeListener"](listener, (error) => {
        registered(error);
        resolve();
      });
    });
    await Promise.resolve();
    connection.sendMessage({ action: "registered" });
    await registration;
    expect(registered).toHaveBeenCalledWith(undefined);

    await new Promise<void>((resolve) => {
      api["GM_audio.removeStateChangeListener"](listener, () => {
        registered();
        resolve();
      });
    });
    expect(registered).toHaveBeenCalledTimes(2);

    const failedApi = createAudioApi();
    const failure = vi.fn();
    const failedRegistration = new Promise<void>((resolve) => {
      failedApi.api["GM_audio.addStateChangeListener"](vi.fn(), (error) => {
        failure(error);
        resolve();
      });
    });
    await Promise.resolve();
    failedApi.connection.sendMessage({ code: -1, message: "注册失败" });
    await failedRegistration;
    expect(failure).toHaveBeenCalledWith("注册失败");
  });
});
