import { type Script, ScriptDAO, type ScriptRunResource } from "@App/app/repo/scripts";
import GMApi from "@App/app/service/content/gm_api/gm_api";
import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it, vi, vitest } from "vitest";
import { addTestPermission, initTestGMApi } from "@Tests/utils";
import { mockNetwork } from "@Tests/mocks/network";
import { setMockNetworkResponse } from "@Tests/mocks/response";

const customXhrResponseMap = new Map<
  string,
  {
    responseHeaders: Record<string, any>;
    responseContent: any;
  }
>();

const realXMLHttpRequest = global.XMLHttpRequest;

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
vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
  return "";
});
vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {
  return undefined;
});

beforeAll(async () => {
  await new ScriptDAO().save(script);
  const { mockXhr } = mockNetwork({
    onSend: async (request) => {
      const customResponse = customXhrResponseMap.get(request.url);
      if (customResponse) {
        return request.respond(200, customResponse.responseHeaders, customResponse.responseContent);
      }
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
        case "https://www.example.com/notexist":
          return request.respond(404, {}, "404 not found");
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
    },
  });
  vi.stubGlobal("XMLHttpRequest", mockXhr);
});

afterAll(() => {
  vi.stubGlobal("XMLHttpRequest", realXMLHttpRequest);
});

describe.concurrent("测试GMApi环境 - XHR", async () => {
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

  addTestPermission(script.uuid);
  await new ScriptDAO().save(script);
  const gmApi = new GMApi("serviceWorker", msg, <ScriptRunResource>{
    uuid: script.uuid,
  });
  it.concurrent("test GM xhr - plain text", async () => {
    const testUrl = "https://mock-xmlhttprequest-plain.test/";
    customXhrResponseMap.set(testUrl, {
      responseHeaders: {},
      responseContent: "example",
    });
    const onload = vitest.fn();
    await new Promise((resolve) => {
      gmApi.GM_xmlhttpRequest({
        url: testUrl,
        onload: (res) => {
          resolve(true);
          onload(res.responseText);
        },
        onloadend: () => {
          resolve(false);
        },
      });
    });
    customXhrResponseMap.delete(testUrl);
    expect(onload).toBeCalled();
    expect(onload.mock.calls[0][0]).toBe("example");
  });
  it.concurrent("test GM xhr - plain text [fetch]", async () => {
    const testUrl = "https://mock-xmlhttprequest-plain-fetch.test/";
    setMockNetworkResponse(testUrl, {
      data: "Response for GET https://mock-xmlhttprequest-plain-fetch.test/",
      contentType: "text/plain",
    });
    const onload = vitest.fn();
    await new Promise((resolve) => {
      gmApi.GM_xmlhttpRequest({
        fetch: true,
        url: testUrl,
        onload: (res) => {
          resolve(true);
          onload(res.responseText);
        },
        onloadend: () => {
          resolve(false);
        },
      });
    });
    expect(onload).toBeCalled();
    expect(onload.mock.calls[0][0]).toBe("Response for GET https://mock-xmlhttprequest-plain-fetch.test/");
  });
  it.concurrent("test GM xhr - blob", async () => {
    // Define a simple HTML page as a string
    const htmlContent = `
  <!DOCTYPE html>
  <html>
  <head>
    <title>Blob HTML Example</title>
  </head>
  <body>
    <h1>Hello from a Blob!</h1>
    <p>This HTML page is generated from a JavaScript Blob object.</p>
  </body>
  </html>
  `;

    // Create a Blob object from the HTML string
    const blob = new Blob([htmlContent], { type: "text/html" });

    const testUrl = "https://mock-xmlhttprequest-blob.test/";
    customXhrResponseMap.set(testUrl, {
      responseHeaders: {},
      responseContent: blob,
    });
    const onload = vitest.fn();
    await new Promise((resolve) => {
      gmApi.GM_xmlhttpRequest({
        url: testUrl,
        responseType: "blob",
        onload: (res) => {
          onload(res);
        },
        onloadend: () => {
          resolve(false);
        },
      });
    });
    customXhrResponseMap.delete(testUrl);
    expect(onload).toBeCalled();
  });

  it.concurrent("test GM xhr - blob [fetch]", async () => {
    // Define a simple HTML page as a string
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Blob HTML Example</title>
</head>
<body>
  <h1>Hello from a Blob!</h1>
  <p>This HTML page is generated from a JavaScript Blob object.</p>
</body>
</html>
`;

    // Create a Blob object from the HTML string
    const blob = new Blob([htmlContent], { type: "text/html" });

    setMockNetworkResponse("https://mock-xmlhttprequest.test/", {
      data: htmlContent,
      contentType: "text/html",
      blob: true,
    });
    const fn1 = vitest.fn();
    const fn2 = vitest.fn();
    await new Promise((resolve) => {
      gmApi.GM_xmlhttpRequest({
        fetch: true,
        responseType: "blob",
        url: "https://mock-xmlhttprequest.test/",
        onload: (res) => {
          if (!(res.response instanceof Blob)) {
            resolve(false);
            return;
          }
          fn2(res.response);
          (res.response as Blob).text().then((text) => {
            resolve(true);
            fn1(text);
          });
        },
        onloadend: () => {
          resolve(false);
        },
      });
    });
    expect(fn1).toBeCalled();
    expect(fn1.mock.calls[0][0]).toBe(htmlContent);
    expect(fn2.mock.calls[0][0]).not.toBe(blob);
  });

  it.concurrent("test GM xhr - json", async () => {
    // Create a Blob object from the HTML string
    const jsonObj = { code: 100, result: { a: 3, b: [2, 4], c: ["1", "2", "4"], d: { e: [1, 3], f: "4" } } };
    const jsonObjStr = JSON.stringify(jsonObj);

    const testUrl = "https://mock-xmlhttprequest-json.test/";
    customXhrResponseMap.set(testUrl, {
      responseHeaders: { "Content-Type": "application/json" },
      responseContent: jsonObjStr,
    });
    const fn1 = vitest.fn();
    const fn2 = vitest.fn();
    await new Promise((resolve) => {
      gmApi.GM_xmlhttpRequest({
        url: testUrl,
        responseType: "json",
        onload: (res) => {
          resolve(true);
          fn1(res.responseText);
          fn2(res.response);
        },
        onloadend: () => {
          resolve(false);
        },
      });
    });
    customXhrResponseMap.delete(testUrl);
    expect(fn1).toBeCalled();
    expect(fn1.mock.calls[0][0]).toBe(jsonObjStr);
    expect(fn2.mock.calls[0][0]).toStrictEqual(jsonObj);
  });

  it.concurrent("test GM xhr - json [fetch]", async () => {
    // Create a Blob object from the HTML string
    const jsonObj = { code: 100, result: { a: 3, b: [2, 4], c: ["1", "2", "4"], d: { e: [1, 3], f: "4" } } };
    const jsonObjStr = JSON.stringify(jsonObj);
    const testUrl = "https://mock-xmlhttprequest-json-fetch.test/";
    setMockNetworkResponse(testUrl, {
      data: jsonObjStr,
      contentType: "application/json",
    });
    const fn1 = vitest.fn();
    const fn2 = vitest.fn();
    await new Promise((resolve) => {
      gmApi.GM_xmlhttpRequest({
        fetch: true,
        url: testUrl,
        responseType: "json",
        onload: (res) => {
          resolve(true);
          fn1(res.responseText);
          fn2(res.response);
        },
        onloadend: () => {
          resolve(false);
        },
      });
    });
    expect(fn1).toBeCalled();
    expect(fn1.mock.calls[0][0]).toBe(jsonObjStr);
    expect(fn2.mock.calls[0][0]).toStrictEqual(jsonObj);
  });
});

describe.concurrent("GM xmlHttpRequest", () => {
  const msg = initTestGMApi();
  const gmApi = new GMApi("serviceWorker", msg, <ScriptRunResource>{
    uuid: script.uuid,
  });
  it.concurrent("get", () => {
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

  // xml原版是没有responseText的,但是tampermonkey有,恶心的兼容性
  it.concurrent("json", async () => {
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
  it.concurrent("header", async () => {
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
  it.concurrent("404", async () => {
    await new Promise<void>((resolve) => {
      gmApi.GM_xmlhttpRequest({
        url: "https://www.example.com/notexist",
        method: "GET",
        onload: (resp) => {
          expect(resp.status).toBe(404);
          expect(resp.responseText).toBe("404 not found");
          resolve();
        },
      });
    });
  });
});

describe("GM download", () => {
  const msg = initTestGMApi();
  const gmApi = new GMApi("serviceWorker", msg, <ScriptRunResource>{
    uuid: script.uuid,
  });
  it("simple download", async () => {
    const testUrl = "https://download.test/";
    const originalBlob = new Blob(["download content"], { type: "text/plain" });

    const mockBlobUrl = "blob:http://localhost/mock-blob-url";
    const createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue(mockBlobUrl);

    setMockNetworkResponse(testUrl, {
      data: originalBlob,
      contentType: "text/plain",
    });

    const onprogress = vitest.fn();
    await new Promise<void>((resolve) => {
      gmApi.GM_download({
        url: "https://download.test/",
        name: "example.txt",
        onprogress: onprogress,
        onload: () => {
          // 下载完成
          console.log("Download completed");
          resolve();
        },
      });
    });
    expect(onprogress).toBeCalled();
    const lastProgressCall = onprogress.mock.calls[onprogress.mock.calls.length - 1][0];
    expect(lastProgressCall).toMatchObject({
      done: 16,
      lengthComputable: false,
      mode: "native",
      loaded: 16,
      total: -1,
      totalSize: -1,
    });

    // 验证 createObjectURL 被调用,并且传入的是 Blob
    expect(createObjectURLSpy).toHaveBeenCalled();
    const calledBlob = createObjectURLSpy.mock.calls[0][0];

    // 判断是否是同一个 blob 引用
    expect(calledBlob).toEqual(originalBlob);

    createObjectURLSpy.mockRestore();
  });
});
