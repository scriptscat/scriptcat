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
  it("POST 且带请求体、注册了 upload 回调时，发往后台的 param 应携带 hasUpload: true", async () => {
    const { api } = createFakeApi();
    const details = {
      url: "https://example.com/upload",
      method: "POST",
      data: "payload",
      upload: { onprogress: vi.fn() },
    } as unknown as GMTypes.XHRDetails;

    GM_xmlhttpRequest(api, details, false);
    await waitTick();

    const connectMock = api.connect as unknown as ReturnType<typeof vi.fn>;
    expect(connectMock).toHaveBeenCalledTimes(1);
    const [, params] = connectMock.mock.calls[0];
    expect(params[0].hasUpload).toBe(true);
  });

  it("未注册 upload 回调时，即使 POST 带请求体，发往后台的 param.hasUpload 也应为 false", async () => {
    const { api } = createFakeApi();
    const details = {
      url: "https://example.com/upload",
      method: "POST",
      data: "payload",
    } as unknown as GMTypes.XHRDetails;

    GM_xmlhttpRequest(api, details, false);
    await waitTick();

    const connectMock = api.connect as unknown as ReturnType<typeof vi.fn>;
    const [, params] = connectMock.mock.calls[0];
    expect(params[0].hasUpload).toBe(false);
  });

  it.each([
    ["GET 请求（无请求体，即便注册了 upload 回调）", { method: "GET" }],
    ["HEAD 请求（无请求体，即便注册了 upload 回调）", { method: "HEAD" }],
    ["POST 但未提供 data（无请求体）", { method: "POST" }],
    ["fetch: true（改走 fetch 传输，不支持 upload）", { method: "POST", data: "payload", fetch: true }],
    ["设置了 redirect（改走 fetch 传输）", { method: "POST", data: "payload", redirect: "follow" }],
    ["anonymous: true（改走 fetch 传输）", { method: "POST", data: "payload", anonymous: true }],
    ["responseType: stream（改走 fetch 传输）", { method: "POST", data: "payload", responseType: "stream" }],
  ])("%s：即使注册了 upload 回调，param.hasUpload 也应为 false（不会产生真实 upload 阶段）", async (_label, extra) => {
    const { api } = createFakeApi();
    const details = {
      url: "https://example.com/upload",
      ...extra,
      upload: { onabort: vi.fn(), onloadend: vi.fn() },
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

  it("调用返回的 abort() 时，若 upload 阶段尚未完成（POST 带请求体），应先补发 details.upload.onabort 与 onloadend", async () => {
    const { api } = createFakeApi();
    const onUploadAbort = vi.fn();
    const onUploadLoadEnd = vi.fn();
    const onabort = vi.fn();
    const details = {
      url: "https://example.com/upload",
      method: "POST",
      data: "payload",
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

  it.each([
    ["GET 请求", { method: "GET" }],
    ["HEAD 请求", { method: "HEAD" }],
    ["POST 但未提供 data", { method: "POST" }],
    ["fetch: true", { method: "POST", data: "payload", fetch: true }],
  ])(
    "%s：即使注册了 upload 回调，调用 abort() 也不应触发 upload 的 abort/loadend（不存在真实 upload 阶段）",
    async (_label, extra) => {
      const { api } = createFakeApi();
      const onUploadAbort = vi.fn();
      const onUploadLoadEnd = vi.fn();
      const details = {
        url: "https://example.com/upload",
        ...extra,
        upload: { onabort: onUploadAbort, onloadend: onUploadLoadEnd },
      } as unknown as GMTypes.XHRDetails;

      const { abort } = GM_xmlhttpRequest(api, details, false);
      await waitTick();

      abort();
      await waitTick();

      expect(onUploadAbort).not.toHaveBeenCalled();
      expect(onUploadLoadEnd).not.toHaveBeenCalled();
    }
  );

  it("即使未设置 details.onabort，只要注册了 upload 回调且存在真实 upload 阶段，调用 abort() 仍应触发 upload 的 abort/loadend", async () => {
    const { api } = createFakeApi();
    const onUploadAbort = vi.fn();
    const onUploadLoadEnd = vi.fn();
    const details = {
      url: "https://example.com/upload",
      method: "POST",
      data: "payload",
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
      method: "POST",
      data: "payload",
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

  it("在 upload.onload 回调内同步调用 abort() 时，不应误触发 upload.onabort，onloadend 只触发一次", async () => {
    const { api, getMessageHandler } = createFakeApi();
    const onUploadAbort = vi.fn();
    const onUploadLoadEnd = vi.fn();
    const requestRef: { current?: ReturnType<typeof GM_xmlhttpRequest> } = {};
    const details = {
      url: "https://example.com/upload",
      method: "POST",
      data: "payload",
      upload: {
        onload: () => requestRef.current?.abort(),
        onabort: onUploadAbort,
        onloadend: onUploadLoadEnd,
      },
    } as unknown as GMTypes.XHRDetails;

    requestRef.current = GM_xmlhttpRequest(api, details, false);
    await waitTick();
    const messageHandler = getMessageHandler();

    // 对齐规范：原生实现会先送 upload load，upload complete flag 随即置位，随后才是 loadend
    messageHandler!({
      action: "onuploadload",
      data: {
        finalUrl: "",
        readyState: 1,
        status: 0,
        statusText: "",
        responseHeaders: "",
        useFetch: false,
        eventType: "uploadload",
        ok: false,
        contentType: "",
        loaded: 10,
        total: 10,
        lengthComputable: true,
      },
    });
    await waitTick();

    expect(onUploadAbort).not.toHaveBeenCalled();

    messageHandler!({
      action: "onuploadloadend",
      data: {
        finalUrl: "",
        readyState: 1,
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

    expect(onUploadAbort).not.toHaveBeenCalled();
    expect(onUploadLoadEnd).toHaveBeenCalledTimes(1);
  });

  it("在 upload.onload 回调内同步调用 abort() 且 onloadend 消息因通道断开而丢失时，兜底补发的 onloadend 应携带真实的已传输数据", async () => {
    const { api, getMessageHandler } = createFakeApi();
    const onUploadLoadEnd = vi.fn();
    const requestRef: { current?: ReturnType<typeof GM_xmlhttpRequest> } = {};
    const details = {
      url: "https://example.com/upload",
      method: "POST",
      data: "payload",
      upload: {
        onload: () => requestRef.current?.abort(),
        onloadend: onUploadLoadEnd,
      },
    } as unknown as GMTypes.XHRDetails;

    requestRef.current = GM_xmlhttpRequest(api, details, false);
    await waitTick();
    const messageHandler = getMessageHandler();

    // 真实的 onuploadload 消息（携带真实进度数据）；其回调内同步调用 abort()，
    // 通道随即断开，真正的 onuploadloadend 消息不会再被处理——由 abort() 兜底补发
    messageHandler!({
      action: "onuploadload",
      data: {
        finalUrl: "",
        readyState: 1,
        status: 0,
        statusText: "",
        responseHeaders: "",
        useFetch: false,
        eventType: "uploadload",
        ok: false,
        contentType: "",
        loaded: 512,
        total: 1024,
        lengthComputable: true,
      },
    });
    await waitTick();

    expect(onUploadLoadEnd).toHaveBeenCalledTimes(1);
    const arg = onUploadLoadEnd.mock.calls[0][0];
    expect(arg.loaded).toBe(512);
    expect(arg.total).toBe(1024);
    expect(arg.lengthComputable).toBe(true);
  });

  it.each([
    ["onuploaderror", "onerror", "onerror"],
    ["onuploadtimeout", "ontimeout", "ontimeout"],
  ])(
    "在 upload.%s 回调内调用 abort() 时应为空操作，让真实的主 %s 消息正常驱动 details.%s",
    async (uploadAction, uploadHandlerName, mainHandlerName) => {
      const { api, getMessageHandler } = createFakeApi();
      const mainHandler = vi.fn();
      const onMainAbort = vi.fn();
      const requestRef: { current?: ReturnType<typeof GM_xmlhttpRequest> } = {};
      const details = {
        url: "https://example.com/upload",
        method: "POST",
        data: "payload",
        [mainHandlerName]: mainHandler,
        onabort: onMainAbort,
        upload: {
          [uploadHandlerName]: () => requestRef.current?.abort(),
        },
      } as unknown as GMTypes.XHRDetails;

      requestRef.current = GM_xmlhttpRequest(api, details, false);
      await waitTick();
      const messageHandler = getMessageHandler();

      // 后台在真实的主 onerror/ontimeout 之前，先送出配对的 upload 事件
      messageHandler!({
        action: uploadAction,
        data: {
          finalUrl: "",
          readyState: 4,
          status: 0,
          statusText: "",
          responseHeaders: "",
          useFetch: false,
          eventType: uploadAction.slice(2),
          ok: false,
          contentType: "",
        },
      });
      await waitTick();

      // 回调内调用的 abort() 应为空操作：不应触发合成的主 onabort
      expect(onMainAbort).not.toHaveBeenCalled();

      // 通道未被断开，真实的主消息随后到达时应正常驱动对应回调
      messageHandler!({
        action: mainHandlerName,
        data: {
          finalUrl: "",
          readyState: 4,
          status: 0,
          statusText: "",
          responseHeaders: "",
          useFetch: false,
          eventType: mainHandlerName.slice(2),
          ok: false,
          contentType: "",
          error: mainHandlerName === "onerror" ? "Unknown Error" : undefined,
        },
      });
      await waitTick();

      expect(mainHandler).toHaveBeenCalledTimes(1);
      expect(onMainAbort).not.toHaveBeenCalled();
    }
  );

  it("同步 abort() 补发的 upload.onabort / onloadend 应携带 loaded:0/total:0/lengthComputable:false", async () => {
    const { api } = createFakeApi();
    const onUploadAbort = vi.fn();
    const onUploadLoadEnd = vi.fn();
    const details = {
      url: "https://example.com/upload",
      method: "POST",
      data: "payload",
      upload: { onabort: onUploadAbort, onloadend: onUploadLoadEnd },
    } as unknown as GMTypes.XHRDetails;

    const { abort } = GM_xmlhttpRequest(api, details, false);
    await waitTick();

    abort();
    await waitTick();

    for (const fn of [onUploadAbort, onUploadLoadEnd]) {
      expect(fn).toHaveBeenCalledTimes(1);
      const arg = fn.mock.calls[0][0];
      expect(arg.loaded).toBe(0);
      expect(arg.total).toBe(0);
      expect(arg.lengthComputable).toBe(false);
    }
  });

  it("从未完成的 upload 阶段调用 abort() 时，事件应按 upload.abort → upload.loadend → 主 abort → 主 loadend 的顺序触发", async () => {
    const { api } = createFakeApi();
    const order: string[] = [];
    const details = {
      url: "https://example.com/upload",
      method: "POST",
      data: "payload",
      onabort: () => order.push("main-abort"),
      onloadend: () => order.push("main-loadend"),
      upload: {
        onabort: () => order.push("upload-abort"),
        onloadend: () => order.push("upload-loadend"),
      },
    } as unknown as GMTypes.XHRDetails;

    const { abort } = GM_xmlhttpRequest(api, details, false);
    await waitTick();

    abort();
    await waitTick();

    expect(order).toEqual(["upload-abort", "upload-loadend", "main-abort", "main-loadend"]);
  });

  it("upload 回调为非函数真值时，不应视为已注册 upload 回调（不启用 upload 监听，避免额外 CORS 预检与运行时报错）", async () => {
    const { api } = createFakeApi();
    const details = {
      url: "https://example.com/upload",
      upload: { onprogress: true as unknown as GMTypes.Listener<GMTypes.XHRProgress> },
    } as unknown as GMTypes.XHRDetails;

    GM_xmlhttpRequest(api, details, false);
    await waitTick();

    const connectMock = api.connect as unknown as ReturnType<typeof vi.fn>;
    const [, params] = connectMock.mock.calls[0];
    expect(params[0].hasUpload).toBe(false);
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
