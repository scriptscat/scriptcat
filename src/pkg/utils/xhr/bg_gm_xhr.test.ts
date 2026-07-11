import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MessageConnect } from "@Packages/message/types";
import { BgGMXhr } from "./bg_gm_xhr";

class FakeXMLHttpRequest {
  static instances: FakeXMLHttpRequest[] = [];

  readyState = 0;
  status = 0;
  statusText = "";
  responseURL = "";
  responseType = "";
  response: unknown = null;
  responseText = "";
  timeout = 0;
  withCredentials = false;
  upload: Record<string, ((evt: any) => void) | null> = {};

  onreadystatechange: ((evt: any) => void) | null = null;
  onloadstart: ((evt: any) => void) | null = null;
  onload: ((evt: any) => void) | null = null;
  onloadend: ((evt: any) => void) | null = null;
  onerror: ((evt: any) => void) | null = null;
  onprogress: ((evt: any) => void) | null = null;
  onabort: ((evt: any) => void) | null = null;
  ontimeout: ((evt: any) => void) | null = null;

  sentData: unknown;

  constructor() {
    FakeXMLHttpRequest.instances.push(this);
  }

  open(_method: string, url: string) {
    this.responseURL = url;
  }

  setRequestHeader() {}

  overrideMimeType() {}

  getResponseHeader(): string | null {
    return null;
  }

  getAllResponseHeaders(): string {
    return "";
  }

  send(data: unknown) {
    this.sentData = data;
  }

  abort() {}
}

const waitTick = async (times = 2) => {
  for (let i = 0; i < times; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

describe("BgGMXhr 的 upload 事件转发", () => {
  let originalXHR: typeof XMLHttpRequest;
  let msgConn: MessageConnect;
  let sentMessages: { action: string; data: any }[];

  beforeEach(() => {
    FakeXMLHttpRequest.instances = [];
    sentMessages = [];
    msgConn = {
      onMessage: vi.fn(),
      sendMessage: vi.fn((data: any) => {
        sentMessages.push(data);
      }),
      disconnect: vi.fn(),
      onDisconnect: vi.fn(),
    };
    originalXHR = global.XMLHttpRequest;
    // @ts-expect-error 测试用假 XMLHttpRequest 替换全局实现
    global.XMLHttpRequest = FakeXMLHttpRequest;
  });

  afterEach(() => {
    global.XMLHttpRequest = originalXHR;
  });

  const createXhr = async () => {
    const details = { method: "POST", url: "https://example.com/upload" } as unknown as GMSend.XHRDetails;
    const bgGmXhr = new BgGMXhr(
      details,
      { statusCode: 0, finalUrl: "", responseHeaders: "" },
      msgConn,
      null,
      "marker-1"
    );
    bgGmXhr.do();
    await waitTick();
    const xhr = FakeXMLHttpRequest.instances[0];
    expect(xhr).toBeDefined();
    return xhr;
  };

  it("原生 XHR 的 upload.onprogress 触发时，应发送携带进度数据的 onuploadprogress 消息", async () => {
    const xhr = await createXhr();
    expect(typeof xhr.upload.onprogress).toBe("function");

    xhr.readyState = 1;
    xhr.upload.onprogress?.({ type: "progress", loaded: 30, total: 120, lengthComputable: true });
    await waitTick();

    const msg = sentMessages.find((m) => m.action === "onuploadprogress");
    expect(msg).toBeDefined();
    expect(msg!.data.loaded).toBe(30);
    expect(msg!.data.total).toBe(120);
    expect(msg!.data.lengthComputable).toBe(true);
  });

  it.each([
    ["loadstart", "onuploadloadstart"],
    ["load", "onuploadload"],
    ["loadend", "onuploadloadend"],
    ["error", "onuploaderror"],
    ["abort", "onuploadabort"],
    ["timeout", "onuploadtimeout"],
  ])("原生 XHR 的 upload.on%s 触发时，应发送 %s 消息", async (nativeType, expectedAction) => {
    const xhr = await createXhr();
    const handlerName = `on${nativeType}` as keyof FakeXMLHttpRequest["upload"];
    expect(typeof xhr.upload[handlerName]).toBe("function");

    xhr.upload[handlerName]?.({ type: nativeType, loaded: 10, total: 10, lengthComputable: true });
    await waitTick();

    const msg = sentMessages.find((m) => m.action === expectedAction);
    expect(msg).toBeDefined();
  });

  it("不应影响主响应事件的消息转发（onload 仍正常发送）", async () => {
    const xhr = await createXhr();
    xhr.readyState = 4;
    xhr.status = 200;
    xhr.onload?.({ type: "load" });
    await waitTick();

    const msg = sentMessages.find((m) => m.action === "onload");
    expect(msg).toBeDefined();
  });
});
