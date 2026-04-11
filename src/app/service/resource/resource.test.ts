import IoC from "@App/app/ioc";
import MessageCenter from "@App/app/message/center";
import { MessageHander } from "@App/app/message/message";
import initTestEnv from "@App/pkg/utils/test_utils";
import ResourceManager from "./manager";
import { Script } from "@App/app/repo/scripts";

// mock fetch 路由表
const fetchMocks: Record<
  string,
  { status: number; blob: Blob; contentType: string }
> = {};

function mockFetchRoute(
  url: string,
  status: number,
  blob: Blob,
  contentType: string
) {
  fetchMocks[url] = { status, blob, contentType };
}

// @ts-ignore
global.fetch = jest.fn((url: string) => {
  const mock = fetchMocks[url];
  if (!mock) {
    return Promise.reject(new Error(`not implemented`));
  }
  return Promise.resolve({
    status: mock.status,
    blob: () => Promise.resolve(mock.blob),
    headers: new Headers({ "content-type": mock.contentType }),
  });
});

// @ts-ignore
global.sandbox = global;

initTestEnv();
const center = new MessageCenter();
IoC.registerInstance(MessageCenter, center).alias([MessageHander]);

describe("resource manager", () => {
  const manager = IoC.instance(ResourceManager) as ResourceManager;
  it("get resource", async () => {
    mockFetchRoute(
      "http://localhost/resource",
      200,
      new Blob(["test"]),
      "application/octet-stream"
    );
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
    mockFetchRoute(
      "http://localhost/require",
      200,
      new Blob([String.fromCharCode(1) + String.fromCharCode(2)]),
      "application/octet-stream"
    );
    const require = await manager.getResource(
      1,
      "http://localhost/require",
      "require"
    );
    expect(require!.content).toEqual("");
  });
  it("bad resource", async () => {
    mockFetchRoute(
      "http://localhost/require2",
      200,
      new Blob(["test"], { type: "text/javascript" }),
      "text/javascript"
    );
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
