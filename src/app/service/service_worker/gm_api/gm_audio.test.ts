import { afterEach, describe, expect, it, vi } from "vitest";
import type { IGetSender } from "@Packages/message/server";
import { GetSenderType } from "@Packages/message/server";
import type { MessageConnect, TMessage } from "@Packages/message/types";
import type { GMApiRequest } from "../types";
import GMApi from "./gm_api";
import chromeMock from "@Packages/chrome-extension-mock";

class TestConnection implements MessageConnect {
  readonly messages: TMessage[] = [];
  private disconnectListener?: (isSelfDisconnected: boolean) => void;

  onMessage(): void {}

  sendMessage(data: TMessage): void {
    this.messages.push(data);
  }

  disconnect(): void {
    this.disconnectListener?.(true);
  }

  onDisconnect(callback: (isSelfDisconnected: boolean) => void): void {
    this.disconnectListener = callback;
  }
}

const createRequest = (params: unknown[]) =>
  ({
    uuid: "gm-audio-test",
    runFlag: "run-flag",
    api: "GM_audio",
    params,
    script: { metadata: { grant: ["GM_audio"] } },
  }) as unknown as GMApiRequest;

const createSender = (tabId: number, connection?: MessageConnect): IGetSender => ({
  getType: () => (connection ? GetSenderType.CONNECT : GetSenderType.RUNTIME),
  isType: (type) => Boolean(connection) && type === GetSenderType.CONNECT,
  getSender: () => undefined,
  getExtMessageSender: () => ({ tabId }),
  getConnect: () => connection,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Service Worker GM_audio", () => {
  it("设置并读取当前标签页的静音与音频状态", async () => {
    const update = vi.fn(async () => ({ id: 7 }));
    const get = vi.fn(async () => ({
      id: 7,
      audible: true,
      mutedInfo: { muted: true, reason: "extension" },
    }));
    vi.stubGlobal("chrome", {
      ...chromeMock,
      tabs: { ...chromeMock.tabs, update, get },
    });
    const api = Object.create(GMApi.prototype) as GMApi;
    const sender = createSender(7);

    await expect(api.GM_audio(createRequest(["setMute", { isMuted: true }]), sender)).resolves.toBeUndefined();
    await expect(api.GM_audio(createRequest(["getState"]), sender)).resolves.toEqual({
      isMuted: true,
      muteReason: "extension",
      isAudible: true,
    });
    expect(update).toHaveBeenCalledWith(7, { muted: true });
    expect(get).toHaveBeenCalledWith(7);
  });

  it("仅转发当前标签页的 muted 与 audible 变化，并在连接断开时清理", async () => {
    let onUpdated: ((tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo) => void) | undefined;
    const addListener = vi.fn((listener: typeof onUpdated) => {
      onUpdated = listener;
    });
    const removeListener = vi.fn();
    vi.stubGlobal("chrome", {
      ...chromeMock,
      tabs: {
        ...chromeMock.tabs,
        onUpdated: { addListener, removeListener },
      },
    });
    const api = Object.create(GMApi.prototype) as GMApi;
    const connection = new TestConnection();

    await api.GM_audio(createRequest(["addStateChangeListener"]), createSender(7, connection));
    expect(connection.messages).toEqual([{ action: "registered" }]);

    onUpdated?.(8, { audible: true });
    onUpdated?.(7, { status: "complete" });
    onUpdated?.(7, { mutedInfo: { muted: true, reason: "user" }, audible: false });
    expect(connection.messages).toEqual([
      { action: "registered" },
      { action: "stateChange", data: { muted: "user", audible: false } },
    ]);

    connection.disconnect();
    expect(removeListener).toHaveBeenCalledWith(onUpdated);
  });

  it("拒绝后台上下文、无效参数和非长连接监听注册", async () => {
    const api = Object.create(GMApi.prototype) as GMApi;

    await expect(api.GM_audio(createRequest(["getState"]), createSender(-1))).rejects.toThrow(
      "GM_audio is not available in this context"
    );
    await expect(api.GM_audio(createRequest(["setMute", { isMuted: "yes" }]), createSender(7))).rejects.toThrow(
      "GM_audio.setMute: Invalid argument"
    );
    await expect(api.GM_audio(createRequest(["addStateChangeListener"]), createSender(7))).rejects.toThrow(
      "GM_audio.addStateChangeListener requires a connection"
    );
  });
});
