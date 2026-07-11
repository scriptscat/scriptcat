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

  it("connect() 尚未 resolve 时移除再重新添加监听器，不应泄漏先前的连接", async () => {
    const first = vi.fn();
    const second = vi.fn();

    const connections = [
      new MockMessageConnect(new EventEmitter<string, TMessage>()),
      new MockMessageConnect(new EventEmitter<string, TMessage>()),
    ];
    const disconnects = connections.map((c) => vi.spyOn(c, "disconnect"));
    const resolvers: Array<(connection: MockMessageConnect) => void> = [];
    const connect = vi.fn(
      () =>
        new Promise<MockMessageConnect>((resolve) => {
          resolvers.push(resolve);
        })
    );
    const message = { connect } as unknown as Message;
    const api = new GMApi("serviceWorker", message, message, {
      uuid: "gm-audio-test",
      value: {},
    } as ScriptRunResource);

    // 1. 添加监听器，connect() 尚未 resolve
    const firstAttempt = api["GM.audio.addStateChangeListener"](first);
    // 2. 在 connect() resolve 之前移除该监听器（归零）
    await api["GM.audio.removeStateChangeListener"](first);
    // 3. 立即重新添加，触发第二次 connect()
    const secondAttempt = api["GM.audio.addStateChangeListener"](second);
    expect(connect).toHaveBeenCalledTimes(2);

    // 4. 两次 connect() 均 resolve：先是过期的第一次尝试，然后才是当前尝试
    resolvers[0](connections[0]);
    await Promise.resolve();
    await Promise.resolve();
    resolvers[1](connections[1]);
    await Promise.resolve();
    connections[1].sendMessage({ action: "registered" });
    await secondAttempt;
    await firstAttempt;

    // 过期的第一个连接必须被立即断开，不能被当前连接覆盖后遗留
    expect(disconnects[0]).toHaveBeenCalledTimes(1);
    expect(disconnects[1]).toHaveBeenCalledTimes(0);

    connections[1].sendMessage({ action: "stateChange", data: { muted: "user", audible: true } });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ muted: "user", audible: true });

    await api["GM.audio.removeStateChangeListener"](second);
    expect(disconnects[1]).toHaveBeenCalledTimes(1);
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

  it("service worker 意外断线（非本端主动断开）时应保留监听器并自动重连，而非静默丢弃", async () => {
    const connections = [
      new MockMessageConnect(new EventEmitter<string, TMessage>()),
      new MockMessageConnect(new EventEmitter<string, TMessage>()),
    ];
    const connect = vi.fn().mockResolvedValueOnce(connections[0]).mockResolvedValueOnce(connections[1]);
    const message = { connect } as unknown as Message;
    const api = new GMApi("serviceWorker", message, message, {
      uuid: "gm-audio-test",
      value: {},
    } as ScriptRunResource);
    const listener = vi.fn();

    const registration = api["GM.audio.addStateChangeListener"](listener);
    await Promise.resolve();
    connections[0].sendMessage({ action: "registered" });
    await registration;
    expect(connect).toHaveBeenCalledTimes(1);

    // service worker 进入 idle 被 MV3 终止，端口在未经本端 disconnect() 调用的情况下断开
    connections[0].EE!.emit("disconnect", false);
    // 监听器不应被清空——脚本从未调用 removeStateChangeListener
    await Promise.resolve();
    await Promise.resolve();
    expect(connect).toHaveBeenCalledTimes(2);

    connections[1].sendMessage({ action: "registered" });
    await Promise.resolve();
    connections[1].sendMessage({ action: "stateChange", data: { audible: true } });
    expect(listener).toHaveBeenCalledWith({ audible: true });

    await api["GM.audio.removeStateChangeListener"](listener);
  });

  it("恢复期间的重连尝试在收到 registered 前又断线时，应保留监听器并退避重试，而非放弃", async () => {
    vi.useFakeTimers();
    try {
      const connections = [
        new MockMessageConnect(new EventEmitter<string, TMessage>()),
        new MockMessageConnect(new EventEmitter<string, TMessage>()),
        new MockMessageConnect(new EventEmitter<string, TMessage>()),
      ];
      const connect = vi
        .fn()
        .mockResolvedValueOnce(connections[0])
        .mockResolvedValueOnce(connections[1])
        .mockResolvedValueOnce(connections[2]);
      const message = { connect } as unknown as Message;
      const api = new GMApi("serviceWorker", message, message, {
        uuid: "gm-audio-test",
        value: {},
      } as ScriptRunResource);
      const listener = vi.fn();

      // 连接 1：初始注册成功
      const registration = api["GM.audio.addStateChangeListener"](listener);
      await Promise.resolve();
      connections[0].sendMessage({ action: "registered" });
      await registration;
      expect(connect).toHaveBeenCalledTimes(1);

      // 连接 1 意外断线（如 service worker 闲置回收），应立即发起连接 2
      connections[0].EE!.emit("disconnect", false);
      await Promise.resolve();
      await Promise.resolve();
      expect(connect).toHaveBeenCalledTimes(2);

      // 连接 2 是恢复期间的重连尝试，在收到 registered 前又断线
      connections[1].EE!.emit("disconnect", false);
      await Promise.resolve();
      await Promise.resolve();
      // 曾经成功注册过，监听器不应被清空，也不应停止重试
      expect(listener).not.toHaveBeenCalled();

      // 退避期间不应立即重连
      expect(connect).toHaveBeenCalledTimes(2);

      // 退避到期后应发起连接 3
      await vi.advanceTimersByTimeAsync(1000);
      expect(connect).toHaveBeenCalledTimes(3);

      connections[2].sendMessage({ action: "registered" });
      await Promise.resolve();
      connections[2].sendMessage({ action: "stateChange", data: { audible: true } });
      expect(listener).toHaveBeenCalledWith({ audible: true });

      await api["GM.audio.removeStateChangeListener"](listener);
    } finally {
      vi.useRealTimers();
    }
  });

  it("本端主动 disconnect（如 removeStateChangeListener）不应触发自动重连", async () => {
    const { api, connect, connection } = createAudioApi();
    const listener = vi.fn();

    const registration = api["GM.audio.addStateChangeListener"](listener);
    await Promise.resolve();
    connection.sendMessage({ action: "registered" });
    await registration;
    expect(connect).toHaveBeenCalledTimes(1);

    await api["GM.audio.removeStateChangeListener"](listener);
    await Promise.resolve();
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("完全移除监听器后重新添加，应开启全新的注册生命周期，而非继承旧的 everRegistered", async () => {
    vi.useFakeTimers();
    try {
      const connections = [
        new MockMessageConnect(new EventEmitter<string, TMessage>()),
        new MockMessageConnect(new EventEmitter<string, TMessage>()),
      ];
      const connect = vi.fn().mockResolvedValueOnce(connections[0]).mockResolvedValueOnce(connections[1]);
      const message = { connect } as unknown as Message;
      const api = new GMApi("serviceWorker", message, message, {
        uuid: "gm-audio-test",
        value: {},
      } as ScriptRunResource);
      const listenerA = vi.fn();
      const listenerB = vi.fn();

      // 监听器 A：注册成功
      const registrationA = api["GM.audio.addStateChangeListener"](listenerA);
      await Promise.resolve();
      connections[0].sendMessage({ action: "registered" });
      await registrationA;

      // 移除 A（listeners 归零），随后添加全新的监听器 B
      await api["GM.audio.removeStateChangeListener"](listenerA);
      const registrationB = api["GM.audio.addStateChangeListener"](listenerB);
      await Promise.resolve();

      // B 的连接在收到 registered 之前就断线：这是一次全新的、从未成功过的注册，
      // 应按“首次注册失败”处理并 reject，而不是被误判为“恢复期间的重连”而重试
      // （若被误判为恢复重连，会改为退避重试，本测试使用 fake timers 且不推进，
      // 此时 registrationB 永远不会 settle，会以超时失败，同样能暴露该缺陷）
      connections[1].EE!.emit("disconnect", false);

      await expect(registrationB).rejects.toBe("GM_audio.addStateChangeListener: Connection disconnected");
      expect(connect).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("恢复期间新增的监听器不应在替补连接尚未注册成功前就提前收到成功", async () => {
    vi.useFakeTimers();
    try {
      const connections = [
        new MockMessageConnect(new EventEmitter<string, TMessage>()),
        new MockMessageConnect(new EventEmitter<string, TMessage>()),
        new MockMessageConnect(new EventEmitter<string, TMessage>()),
      ];
      const connect = vi
        .fn()
        .mockResolvedValueOnce(connections[0])
        .mockResolvedValueOnce(connections[1])
        .mockResolvedValueOnce(connections[2]);
      const message = { connect } as unknown as Message;
      const api = new GMApi("serviceWorker", message, message, {
        uuid: "gm-audio-test",
        value: {},
      } as ScriptRunResource);
      const first = vi.fn();
      const second = vi.fn();

      // 连接 1：初始注册成功
      const firstRegistration = api["GM.audio.addStateChangeListener"](first);
      await Promise.resolve();
      connections[0].sendMessage({ action: "registered" });
      await firstRegistration;

      // 连接 1 意外断线，立即发起连接 2（恢复期间的重连尝试）
      connections[0].EE!.emit("disconnect", false);
      await Promise.resolve();
      await Promise.resolve();
      expect(connect).toHaveBeenCalledTimes(2);

      // 在连接 2 仍处于“已发起但尚未 registered”期间，添加监听器 second，
      // 它应复用同一个仍在进行中的 state.registration
      const secondRegistration = api["GM.audio.addStateChangeListener"](second);
      let secondSettled = false;
      void secondRegistration.then(() => {
        secondSettled = true;
      });

      // 连接 2 在收到 registered 之前又断线：此时不应让 secondRegistration 提前 resolve，
      // 因为既没有活跃连接，也没有收到过 registered 确认
      connections[1].EE!.emit("disconnect", false);
      await Promise.resolve();
      await Promise.resolve();
      expect(secondSettled).toBe(false);

      // 退避到期、发起连接 3 之前，仍不应 resolve
      await vi.advanceTimersByTimeAsync(1000);
      expect(connect).toHaveBeenCalledTimes(3);
      expect(secondSettled).toBe(false);

      // 直到连接 3（下一次重连）真正收到 registered，secondRegistration 才应 resolve
      connections[2].sendMessage({ action: "registered" });
      await secondRegistration;
      expect(secondSettled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("恢复期间收到终止性错误（code）后，也应丢弃 state；此后新增的监听器不应继承旧的 everRegistered", async () => {
    const connections = [
      new MockMessageConnect(new EventEmitter<string, TMessage>()),
      new MockMessageConnect(new EventEmitter<string, TMessage>()),
      new MockMessageConnect(new EventEmitter<string, TMessage>()),
    ];
    const connect = vi
      .fn()
      .mockResolvedValueOnce(connections[0])
      .mockResolvedValueOnce(connections[1])
      .mockResolvedValueOnce(connections[2]);
    const message = { connect } as unknown as Message;
    const api = new GMApi("serviceWorker", message, message, {
      uuid: "gm-audio-test",
      value: {},
    } as ScriptRunResource);
    const listenerA = vi.fn();
    const listenerB = vi.fn();

    // 监听器 A：注册成功
    const registrationA = api["GM.audio.addStateChangeListener"](listenerA);
    await Promise.resolve();
    connections[0].sendMessage({ action: "registered" });
    await registrationA;

    // 连接 1 意外断线，进入恢复期间，立即发起连接 2
    connections[0].EE!.emit("disconnect", false);
    await Promise.resolve();
    await Promise.resolve();
    expect(connect).toHaveBeenCalledTimes(2);

    // 连接 2（恢复期间）在收到 registered 前收到终止性错误（如权限被收回），应彻底放弃，
    // 而不是重试；且应像其他放弃路径一样丢弃 state，而不是让 everRegistered 残留下来
    connections[1].sendMessage({ code: -1, message: "恢复失败" });
    await Promise.resolve();
    // 此时不应再有监听器存活，A 从未被显式移除，但恢复失败后其注册已被放弃
    expect(connect).toHaveBeenCalledTimes(2);

    // 添加全新的监听器 B：这是一次全新的、从未成功过的注册
    const registrationB = api["GM.audio.addStateChangeListener"](listenerB);
    await Promise.resolve();
    expect(connect).toHaveBeenCalledTimes(3);

    // B 的连接在收到 registered 前断线：应按“首次注册失败”处理并 reject，
    // 而不是被残留的 everRegistered 误判为“恢复期间的重连”而重试
    connections[2].EE!.emit("disconnect", false);
    await expect(registrationB).rejects.toBe("GM_audio.addStateChangeListener: Connection disconnected");
    expect(connect).toHaveBeenCalledTimes(3);
  });

  it("同一轮恢复 episode 内的多次重试应共享同一个 state.registration，直至成功或彻底放弃才结算", async () => {
    vi.useFakeTimers();
    try {
      const connections = [
        new MockMessageConnect(new EventEmitter<string, TMessage>()),
        new MockMessageConnect(new EventEmitter<string, TMessage>()),
        new MockMessageConnect(new EventEmitter<string, TMessage>()),
        new MockMessageConnect(new EventEmitter<string, TMessage>()),
      ];
      const connect = vi
        .fn()
        .mockResolvedValueOnce(connections[0])
        .mockResolvedValueOnce(connections[1])
        .mockResolvedValueOnce(connections[2])
        .mockResolvedValueOnce(connections[3]);
      const message = { connect } as unknown as Message;
      const api = new GMApi("serviceWorker", message, message, {
        uuid: "gm-audio-test",
        value: {},
      } as ScriptRunResource);
      const listener = vi.fn();

      // 连接 1：初始注册成功
      const registration = api["GM.audio.addStateChangeListener"](listener);
      await Promise.resolve();
      connections[0].sendMessage({ action: "registered" });
      await registration;

      // 连接 1 意外断线，立即发起连接 2（开启新一轮 episode）
      connections[0].EE!.emit("disconnect", false);
      await Promise.resolve();
      await Promise.resolve();
      // 已注册过的 listener 复用 state.registration，借此取得本轮 episode 的 Promise 身份
      const episodeRegistration = api["GM.audio.addStateChangeListener"](listener);
      let settled = false;
      void episodeRegistration.then(() => {
        settled = true;
      });

      // 连接 2、连接 3 均在收到 registered 前又断线：属于同一轮 episode 内的重试，
      // state.registration 应保持同一身份，不应被替换成新的 Promise
      connections[1].EE!.emit("disconnect", false);
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(1000);
      expect(connect).toHaveBeenCalledTimes(3);
      expect(api["GM.audio.addStateChangeListener"](listener)).toBe(episodeRegistration);
      expect(settled).toBe(false);

      connections[2].EE!.emit("disconnect", false);
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(1000);
      expect(connect).toHaveBeenCalledTimes(4);
      expect(api["GM.audio.addStateChangeListener"](listener)).toBe(episodeRegistration);
      expect(settled).toBe(false);

      // 连接 4 真正收到 registered，本轮 episode 才结算——且结算的正是最初取得的那个 Promise
      connections[3].sendMessage({ action: "registered" });
      await episodeRegistration;
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("GM_audio 回调不应在成功回调抛出异常后被重复调用", () => {
  it("GM_audio.setMute 的回调抛出异常时只应被调用一次", async () => {
    const { api } = createAudioApi();
    const callback = vi.fn(() => {
      throw new Error("callback boom");
    });

    api["GM_audio.setMute"]({ isMuted: true }, callback);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("GM_audio.getState 的回调抛出异常时不应以 undefined 重新调用", async () => {
    const { api } = createAudioApi();
    const callback = vi.fn(() => {
      throw new Error("callback boom");
    });

    api["GM_audio.getState"](callback);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("GM_audio.addStateChangeListener 的注册回调抛出异常时只应被调用一次", async () => {
    const { api, connection } = createAudioApi();
    const callback = vi.fn(() => {
      throw new Error("callback boom");
    });

    api["GM_audio.addStateChangeListener"](vi.fn(), callback);
    await Promise.resolve();
    connection.sendMessage({ action: "registered" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("GM_audio.removeStateChangeListener 的回调抛出异常时只应被调用一次", async () => {
    const { api, connection } = createAudioApi();
    const listener = vi.fn();
    const callback = vi.fn(() => {
      throw new Error("callback boom");
    });

    const registration = api["GM.audio.addStateChangeListener"](listener);
    await Promise.resolve();
    connection.sendMessage({ action: "registered" });
    await registration;

    api["GM_audio.removeStateChangeListener"](listener, callback);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(callback).toHaveBeenCalledTimes(1);
  });
});

describe("GM_audio 状态变化监听器互相隔离", () => {
  it("一个监听器抛出异常不应阻止其余监听器接收状态变化", async () => {
    const { api, connection } = createAudioApi();
    const first = vi.fn(() => {
      throw new Error("first listener boom");
    });
    const second = vi.fn();

    const firstRegistration = api["GM.audio.addStateChangeListener"](first);
    await Promise.resolve();
    connection.sendMessage({ action: "registered" });
    await firstRegistration;
    await api["GM.audio.addStateChangeListener"](second);

    connection.sendMessage({ action: "stateChange", data: { audible: true } });

    expect(first).toHaveBeenCalledWith({ audible: true });
    expect(second).toHaveBeenCalledWith({ audible: true });
  });
});
