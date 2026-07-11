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
  it("注册了 upload 回调时，发往后台的 param 应携带 hasUpload: true", async () => {
    const { api } = createFakeApi();
    const details = {
      url: "https://example.com/upload",
      upload: { onprogress: vi.fn() },
    } as unknown as GMTypes.XHRDetails;

    GM_xmlhttpRequest(api, details, false);
    await waitTick();

    const connectMock = api.connect as unknown as ReturnType<typeof vi.fn>;
    expect(connectMock).toHaveBeenCalledTimes(1);
    const [, params] = connectMock.mock.calls[0];
    expect(params[0].hasUpload).toBe(true);
  });

  it("未注册 upload 回调时，发往后台的 param.hasUpload 应为 false", async () => {
    const { api } = createFakeApi();
    const details = {
      url: "https://example.com/upload",
    } as unknown as GMTypes.XHRDetails;

    GM_xmlhttpRequest(api, details, false);
    await waitTick();

    const connectMock = api.connect as unknown as ReturnType<typeof vi.fn>;
    const [, params] = connectMock.mock.calls[0];
    expect(params[0].hasUpload).toBe(false);
  });

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
  ])(
    "收到 %s 消息时，应调用 details.upload.%s 并携带 loaded/total/lengthComputable",
    async (action, uploadHandlerName) => {
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
          loaded: 42,
          total: 100,
          lengthComputable: true,
        },
      });
      await waitTick();

      expect(handler).toHaveBeenCalledTimes(1);
      const arg = handler.mock.calls[0][0];
      expect(arg.loaded).toBe(42);
      expect(arg.total).toBe(100);
      expect(arg.lengthComputable).toBe(true);
    }
  );

  it("调用返回的 abort() 时，若 upload 阶段尚未完成，应先补发 details.upload.onabort 与 onloadend", async () => {
    const { api } = createFakeApi();
    const onUploadAbort = vi.fn();
    const onUploadLoadEnd = vi.fn();
    const onabort = vi.fn();
    const details = {
      url: "https://example.com/upload",
      onabort,
      upload: {
        onabort: onUploadAbort,
        onloadend: onUploadLoadEnd,
      },
    } as unknown as GMTypes.XHRDetails;

    const { abort } = GM_xmlhttpRequest(api, details, false);
    await waitTick();

    abort();
    await waitTick();

    expect(onUploadAbort).toHaveBeenCalledTimes(1);
    expect(onUploadLoadEnd).toHaveBeenCalledTimes(1);
    expect(onabort).toHaveBeenCalledTimes(1);
  });

  it("即使未设置 details.onabort，只要注册了 upload 回调，调用 abort() 仍应触发 upload 的 abort/loadend", async () => {
    const { api } = createFakeApi();
    const onUploadAbort = vi.fn();
    const onUploadLoadEnd = vi.fn();
    const details = {
      url: "https://example.com/upload",
      upload: {
        onabort: onUploadAbort,
        onloadend: onUploadLoadEnd,
      },
    } as unknown as GMTypes.XHRDetails;

    const { abort } = GM_xmlhttpRequest(api, details, false);
    await waitTick();

    abort();
    await waitTick();

    expect(onUploadAbort).toHaveBeenCalledTimes(1);
    expect(onUploadLoadEnd).toHaveBeenCalledTimes(1);
  });

  it("upload 阶段已经完成（收到 onuploadloadend）后再调用 abort()，不应重复触发 upload 的 abort/loadend", async () => {
    const { api, getMessageHandler } = createFakeApi();
    const onUploadAbort = vi.fn();
    const onUploadLoadEnd = vi.fn();
    const onabort = vi.fn();
    const details = {
      url: "https://example.com/upload",
      onabort,
      upload: {
        onabort: onUploadAbort,
        onloadend: onUploadLoadEnd,
      },
    } as unknown as GMTypes.XHRDetails;

    const { abort } = GM_xmlhttpRequest(api, details, false);
    await waitTick();
    const messageHandler = getMessageHandler();

    messageHandler!({
      action: "onuploadloadend",
      data: {
        finalUrl: "",
        readyState: 3,
        status: 0,
        statusText: "",
        responseHeaders: "",
        useFetch: false,
        eventType: "uploadloadend",
        ok: false,
        contentType: "",
        loaded: 10,
        total: 10,
        lengthComputable: true,
      },
    });
    await waitTick();
    expect(onUploadLoadEnd).toHaveBeenCalledTimes(1);

    abort();
    await waitTick();

    expect(onUploadAbort).not.toHaveBeenCalled();
    expect(onUploadLoadEnd).toHaveBeenCalledTimes(1);
    expect(onabort).toHaveBeenCalledTimes(1);
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
