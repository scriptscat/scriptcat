import { describe, expect, it, vi } from "vitest";
import { GM_xmlhttpRequest } from "./gm_xhr";
import type GMApi from "./gm_api";
import type { MessageConnect, TMessage } from "@Packages/message/types";

const waitTick = async (times = 3) => {
  for (let i = 0; i < times; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

function createFakeApi(): { api: GMApi; getMessageHandler: () => ((data: TMessage) => void) | undefined } {
  let messageHandler: ((data: TMessage) => void) | undefined;
  const fakeConnect: MessageConnect = {
    onMessage: (cb) => {
      messageHandler = cb;
    },
    sendMessage: vi.fn(),
    disconnect: vi.fn(),
    onDisconnect: vi.fn(),
  };
  const api = {
    isInvalidContext: () => false,
    connect: vi.fn().mockResolvedValue(fakeConnect),
    sendMessage: vi.fn(),
  } as unknown as GMApi;
  return { api, getMessageHandler: () => messageHandler };
}

describe("GM_xmlhttpRequest 的 upload 事件派发", () => {
  it("收到 onuploadprogress 消息时，应携带 loaded/total/lengthComputable 调用 details.upload.onprogress", async () => {
    const { api, getMessageHandler } = createFakeApi();
    const onprogress = vi.fn();
    const details = {
      url: "https://example.com/upload",
      upload: { onprogress },
    } as unknown as GMTypes.XHRDetails;

    GM_xmlhttpRequest(api, details, false);
    await waitTick();
    const messageHandler = getMessageHandler();
    expect(messageHandler).toBeTypeOf("function");

    messageHandler!({
      action: "onuploadprogress",
      data: {
        finalUrl: "",
        readyState: 1,
        status: 0,
        statusText: "",
        responseHeaders: "",
        useFetch: false,
        eventType: "uploadprogress",
        ok: false,
        contentType: "",
        loaded: 30,
        total: 120,
        lengthComputable: true,
      },
    });
    await waitTick();

    expect(onprogress).toHaveBeenCalledTimes(1);
    const arg = onprogress.mock.calls[0][0];
    expect(arg.loaded).toBe(30);
    expect(arg.total).toBe(120);
    expect(arg.lengthComputable).toBe(true);
  });

  it.each([
    ["onuploadloadstart", "onloadstart"],
    ["onuploadload", "onload"],
    ["onuploadloadend", "onloadend"],
    ["onuploaderror", "onerror"],
    ["onuploadabort", "onabort"],
    ["onuploadtimeout", "ontimeout"],
  ])("收到 %s 消息时，应调用 details.upload.%s", async (action, uploadHandlerName) => {
    const { api, getMessageHandler } = createFakeApi();
    const handler = vi.fn();
    const details = {
      url: "https://example.com/upload",
      upload: { [uploadHandlerName]: handler },
    } as unknown as GMTypes.XHRDetails;

    GM_xmlhttpRequest(api, details, false);
    await waitTick();
    const messageHandler = getMessageHandler();
    expect(messageHandler).toBeTypeOf("function");

    messageHandler!({
      action,
      data: {
        finalUrl: "",
        readyState: 1,
        status: 0,
        statusText: "",
        responseHeaders: "",
        useFetch: false,
        eventType: action.slice(2),
        ok: false,
        contentType: "",
      },
    });
    await waitTick();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("不应影响主响应回调（onload 仍正常派发）", async () => {
    const { api, getMessageHandler } = createFakeApi();
    const onload = vi.fn();
    const details = {
      url: "https://example.com/upload",
      onload,
    } as unknown as GMTypes.XHRDetails;

    GM_xmlhttpRequest(api, details, false);
    await waitTick();
    const messageHandler = getMessageHandler();

    messageHandler!({
      action: "onload",
      data: {
        finalUrl: "https://example.com/upload",
        readyState: 4,
        status: 200,
        statusText: "OK",
        responseHeaders: "",
        useFetch: false,
        eventType: "load",
        ok: true,
        contentType: "text/plain",
      },
    });
    await waitTick();

    expect(onload).toHaveBeenCalledTimes(1);
  });
});
