import { describe, expect, it, vitest } from "vitest";
import { initTestEnv, initTestGMApi } from "./utils";
import { randomUUID } from "crypto";
import { newMockXhr } from "mock-xmlhttprequest";
import { Script, ScriptDAO, ScriptRunResource } from "@App/app/repo/scripts";
import GMApi from "@App/app/service/content/gm_api";

initTestEnv();

describe("测试GMApi环境", async () => {
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
  await new ScriptDAO().save(script);
  const gmApi = new GMApi("serviceWorker", msg, <ScriptRunResource>{
    uuid: script.uuid
  });
  const mockXhr = newMockXhr();
  mockXhr.onSend = async (request) => {
    return request.respond(200, {}, "example");
  };
  global.XMLHttpRequest = mockXhr;
  it("test GM xhr", async () => {
    const onload = vitest.fn();
    await new Promise((resolve) => {
      gmApi.GM_xmlhttpRequest({
        url: "https://example.com/",
        onload: (res) => {
          console.log(res);
          resolve(res);
          onload(res.responseText);
        },
      });
    });
    expect(onload).toBeCalled();
    expect(onload.mock.calls[0][0]).toBe("example");
  });
});
