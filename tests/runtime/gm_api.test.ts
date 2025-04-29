import { Script, ScriptDAO } from "@App/app/repo/scripts";
import GMApi from "@App/runtime/content/gm_api";
import chromeMock from "@Packages/chrome-extension-mock";
import { initTestEnv, initTestGMApi } from "@Tests/utils";
import { randomUUID } from "crypto";
import { newMockXhr } from "mock-xmlhttprequest";
import { beforeAll, describe, expect, it } from "vitest";

initTestEnv();

const msg = initTestGMApi();

const script: Script = {
  uuid: randomUUID(),
  name: "test",
  metadata: {
    grant: [
      // gm xhr
      "GM_xmlhttpRequest",
    ],
    connect: ["example.com"],
  },
  namespace: "",
  type: 1,
  status: 1,
  sort: 0,
  runStatus: "running",
  createtime: 0,
  checktime: 0,
};

beforeAll(async () => {
  await new ScriptDAO().save(script);
});

describe("GM xmlHttpRequest", () => {
  const gmApi = new GMApi(msg);
  //@ts-ignore
  gmApi.scriptRes = {
    uuid: script.uuid,
  };
  const mockXhr = newMockXhr();
  mockXhr.onSend = async (request) => {
    switch (request.url) {
      case "https://www.example.com/":
        return request.respond(200, {}, "example");
      case window.location.href:
        return request.respond(200, {}, "location");
      case "https://example.com/json":
        return request.respond(200, { "Content-Type": "application/json" }, JSON.stringify({ test: 1 }));
      case "https://www.example.com/header":
        if (request.requestHeaders.getHeader("x-nonce") !== "123456") {
          return request.respond(403, {}, "bad");
        }
        return request.respond(200, {}, "header");
      case "https://www.example.com/unsafeHeader":
        if (
          request.requestHeaders.getHeader("Origin") !== "https://example.com" ||
          request.requestHeaders.getHeader("Cookie") !== "website=example.com"
        ) {
          return request.respond(400, {}, "bad request");
        }
        return request.respond(200, { "Set-Cookie": "test=1" }, "unsafeHeader");
      case "https://www.wexample.com/unsafeHeader/cookie":
        if (request.requestHeaders.getHeader("Cookie") !== "test=1") {
          return request.respond(400, {}, "bad request");
        }
        return request.respond(200, {}, "unsafeHeader/cookie");
    }
    if (request.method === "POST") {
      switch (request.url) {
        case "https://example.com/form":
          if (request.body.get("blob")) {
            return request.respond(
              200,
              { "Content-Type": "text/html" },
              // mock 一个blob对象
              {
                text: () => Promise.resolve("form"),
              }
            );
          }
          return request.respond(400, {}, "bad");
      }
    }
    return request.respond(200, {}, "test");
  };
  global.XMLHttpRequest = mockXhr;
  it("get", () => {
    return new Promise<void>((resolve) => {
      gmApi.GM_xmlhttpRequest({
        url: "https://www.example.com",
        onreadystatechange: (resp) => {
          if (resp.readyState === 4 && resp.status === 200) {
            expect(resp.responseText).toBe("example");
            resolve();
          }
        },
      });
    });
  });

  it("post数据和blob", () => {
    const form = new FormData();
    form.append("blob", new Blob(["blob"], { type: "text/html" }));
    return new Promise<void>((resolve) => {
      gmApi.GM_xmlhttpRequest({
        url: "https://example.com/form",
        method: "POST",
        data: form,
        responseType: "blob",
        onreadystatechange: async (resp) => {
          if (resp.readyState === 4 && resp.status === 200) {
            expect(resp.responseText).toBe("form");
            expect(await (<Blob>resp.response).text()).toBe("form");
            resolve();
          }
        },
      });
    });
  });
  // xml原版是没有responseText的,但是tampermonkey有,恶心的兼容性
  it("json", async () => {
    await new Promise<void>((resolve) => {
      gmApi.GM_xmlhttpRequest({
        url: "https://example.com/json",
        method: "GET",
        responseType: "json",
        onload: (resp) => {
          // @ts-ignore
          expect(resp.response.test).toBe(1);
          expect(resp.responseText).toBe('{"test":1}');
          resolve();
        },
      });
    });
    // bad json
    await new Promise<void>((resolve) => {
      gmApi.GM_xmlhttpRequest({
        url: "https://www.example.com/",
        method: "GET",
        responseType: "json",
        onload: (resp) => {
          expect(resp.response).toBeUndefined();
          expect(resp.responseText).toBe("example");
          resolve();
        },
      });
    });
  });
  it("header", async () => {
    await new Promise<void>((resolve) => {
      gmApi.GM_xmlhttpRequest({
        url: "https://www.example.com/header",
        method: "GET",
        headers: {
          "x-nonce": "123456",
        },
        onload: (resp) => {
          expect(resp.responseText).toBe("header");
          resolve();
        },
      });
    });
  });
  it("unsafeHeader", async () => {
    global.XMLHttpRequest = chromeMock.webRequest.mockXhr(mockXhr);
    // 模拟header
    await new Promise<void>((resolve) => {
      gmApi.GM_xmlhttpRequest({
        url: "https://www.example.com/unsafeHeader",
        method: "GET",
        headers: {
          Origin: "https://example.com",
        },
        onload: (resp) => {
          expect(resp.responseText).toBe("unsafeHeader");
          expect(resp.responseHeaders?.indexOf("set-cookie")).not.toBe(-1);
          resolve();
        },
      });
    });
  });

  it("unsafeHeader/cookie", async () => {
    // global.XMLHttpRequest = chromeMock.webRequest.mockXhr(mockXhr);
    // 模拟header
    await new Promise<void>((resolve) => {
      gmApi.GM_xmlhttpRequest({
        url: "https://www.wexample.com/unsafeHeader/cookie",
        method: "GET",
        headers: {
          Cookie: "test=1",
        },
        anonymous: true,
        onload: (resp) => {
          expect(resp.responseText).toBe("unsafeHeader/cookie");
          resolve();
        },
      });
    });
  });
});
