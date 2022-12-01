import IoC from "@App/app/ioc";
import MessageCenter from "@App/app/message/center";
import { MessageHander } from "@App/app/message/message";
import initTestEnv from "@App/pkg/utils/test_utils";
import ResourceManager from "./manager";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { Script } from "@App/app/repo/scripts";
const mock = new MockAdapter(axios);

// @ts-ignore
global.sandbox = global;

initTestEnv();
const center = new MessageCenter();
IoC.registerInstance(MessageCenter, center).alias([MessageHander]);

describe("resource manager", () => {
  const manager = IoC.instance(ResourceManager) as ResourceManager;
  it("get resource", async () => {
    mock.onGet("http://localhost/resource").reply(200, new Blob(["test"]), {
      "content-type": "application/octet-stream",
    });
    const resource = await manager.getResource(
      1,
      "http://localhost/resource",
      "resource"
    );
    // get by cache
    const resource2 = await manager.getResource(
      1,
      "http://localhost/resource",
      "resource"
    );
    expect(resource).not.toBeUndefined();
    expect(resource).toEqual(resource2);
  });
  it("not text", async () => {
    mock
      .onGet("http://localhost/require")
      .reply(200, new Blob([String.fromCharCode(1) + String.fromCharCode(2)]), {
        "content-type": "application/octet-stream",
      });
    const require = await manager.getResource(
      1,
      "http://localhost/require",
      "require"
    );
    expect(require!.content).toEqual("");
  });
  it("bad resource", async () => {
    mock
      .onGet("http://localhost/require2")
      .reply(200, new Blob(["test"], { type: "text/javascript" }), {
        "content-type": "text/javascript",
      });
    const script: Script = {
      metadata: {
        require: ["http://localhost/require2", "http://bad/resource"],
      },
    } as unknown as Script;
    const result = await manager.getRequireResource(script);
    expect(result["http://localhost/require2"]).not.toBeUndefined();
    expect(result["http://bad/resource"]).toBeUndefined();
  });
});
