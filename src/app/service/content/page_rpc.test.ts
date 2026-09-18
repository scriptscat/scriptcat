import { describe, expect, it, vi } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import {
  getPageRpcAllowedAPIs,
  setPageRpcExtensionOrigin,
  isExtensionBlobUrl,
  PageRpcError,
  PageRpcRegistry,
  validatePageGMRequest,
} from "./page_rpc";

describe("page GM RPC", () => {
  it("expands only the helper operations reachable from an explicit public grant", () => {
    const allowed = getPageRpcAllowedAPIs(["CAT.agent.opfs", "GM_xmlhttpRequest"]);

    expect(allowed).toEqual(
      expect.arrayContaining([
        "CAT.agent.opfs",
        "CAT_agentOPFS",
        "CAT_fetchBlob",
        "GM_xmlhttpRequest",
        "GM.xmlhttpRequest",
      ])
    );
    expect(allowed).not.toContain("CAT_fetchDocument");
    expect(allowed).not.toContain("CAT_createBlobUrl");
    expect(allowed).not.toContain("CAT_agentSkills");
  });

  it("includes APIs exposed through the same dependency graph as the script context", () => {
    const allowed = getPageRpcAllowedAPIs(["GM.openInTab"]);

    expect(allowed).toEqual(expect.arrayContaining(["GM.openInTab", "GM_openInTab", "GM_closeInTab"]));
  });

  it("includes storage APIs used by delete wrappers", () => {
    expect(getPageRpcAllowedAPIs(["GM_deleteValue"])).toEqual(
      expect.arrayContaining(["GM_deleteValue", "GM_setValue"])
    );
    expect(getPageRpcAllowedAPIs(["GM.deleteValues"])).toEqual(
      expect.arrayContaining(["GM.deleteValues", "GM_setValues"])
    );
  });

  it("includes the nested cookie methods exposed by both cookie grant spellings", () => {
    expect(getPageRpcAllowedAPIs(["GM.cookie"])).toEqual(
      expect.arrayContaining(["GM.cookie.set", "GM.cookie.list", "GM.cookie.delete"])
    );
    expect(getPageRpcAllowedAPIs(["GM_cookie"])).toEqual(
      expect.arrayContaining(["GM_cookie.set", "GM_cookie.list", "GM_cookie.delete"])
    );
  });

  it("does not create a GM capability set for a none grant", () => {
    expect(getPageRpcAllowedAPIs(["none", "GM_getValue", "CAT.agent.dom"])).toEqual([]);
  });

  it("honors a none grant when Array.prototype.some is hooked", () => {
    const originalSome = Array.prototype.some;
    Array.prototype.some = (() => false) as typeof Array.prototype.some;
    let allowed: string[];
    try {
      allowed = getPageRpcAllowedAPIs(["none", "GM_getValue"]);
    } finally {
      Array.prototype.some = originalSome;
    }

    expect(allowed!).toEqual([]);
  });

  it("does not let a hooked String.prototype.slice enlarge grant aliases", () => {
    const originalSlice = String.prototype.slice;
    String.prototype.slice = (() => "xmlhttpRequest") as typeof String.prototype.slice;
    let allowed: string[];
    try {
      allowed = getPageRpcAllowedAPIs(["GM.getValue"]);
    } finally {
      String.prototype.slice = originalSlice;
    }

    expect(allowed!).toContain("GM_getValue");
    expect(allowed!).not.toContain("GM_xmlhttpRequest");
  });

  it("ignores inherited capability-map properties for unknown grant names", () => {
    expect(getPageRpcAllowedAPIs(["constructor", "toString"])).toEqual(["constructor", "toString"]);
  });

  it("does not let a hooked Array.prototype.push enlarge the capability result", () => {
    const originalPush = Array.prototype.push;
    Array.prototype.push = function (...items: unknown[]): number {
      return originalPush.call(this, ...items, "GM_xmlhttpRequest");
    };
    let allowed: string[];
    try {
      allowed = getPageRpcAllowedAPIs(["GM_getValue"]);
    } finally {
      Array.prototype.push = originalPush;
    }

    expect(allowed!).not.toContain("GM_xmlhttpRequest");
  });

  it("allows the internal request name used by the GM.xmlHttpRequest wrapper", () => {
    const allowed = getPageRpcAllowedAPIs(["GM.xmlHttpRequest"]);

    expect(allowed).toContain("GM_xmlhttpRequest");
    expect(allowed).not.toContain("CAT_fetchBlob");
    expect(allowed).not.toContain("CAT_fetchDocument");
    expect(allowed).not.toContain("CAT_createBlobUrl");
  });

  it("rejects direct internal fetch helpers from a GM XHR binding", () => {
    const registry = new PageRpcRegistry();
    const handle = registry.register("script-a", "it", getPageRpcAllowedAPIs(["GM_xmlhttpRequest"]));

    expect(() =>
      validatePageGMRequest(
        { version: 1, requestId: "fetch", handle, api: "CAT_fetchBlob", params: ["https://example.com/file"] },
        registry
      )
    ).toThrow("API is not granted");
    expect(() =>
      validatePageGMRequest(
        {
          version: 1,
          requestId: "document",
          handle,
          api: "CAT_fetchDocument",
          params: ["https://example.com/file", false],
        },
        registry
      )
    ).toThrow("API is not granted");
  });

  it("accepts a request for the active execution binding and clones parameters", () => {
    const registry = new PageRpcRegistry();
    const handle = registry.register("script-a", "it", ["GM_getValue"], undefined, "canonical-run");
    const params = { nested: { value: 1 } };

    const request = validatePageGMRequest(
      {
        version: 1,
        requestId: "request-a",
        handle,
        api: "GM_getValue",
        params: [params],
      },
      registry
    );

    expect(request).toEqual({
      version: 1,
      requestId: "request-a",
      handle,
      api: "GM_getValue",
      params: [params],
      uuid: "script-a",
      envTag: "it",
      runFlag: "canonical-run",
    });
    expect(request.params[0]).not.toBe(params);
    expect(() =>
      validatePageGMRequest({ version: 1, requestId: "request-a", handle, api: "GM_getValue", params: [] }, registry)
    ).toThrow("already used");
  });

  it("rejects an unknown or stale execution binding and supplies canonical identity", () => {
    const registry = new PageRpcRegistry();
    const handle = registry.register("script-a", "it", ["GM_getValue"]);

    expect(() =>
      validatePageGMRequest(
        {
          version: 1,
          requestId: "a",
          handle: "missing",
          api: "GM_getValue",
          params: [],
        },
        registry
      )
    ).toThrow(PageRpcError);

    registry.revoke(handle);
    expect(() =>
      validatePageGMRequest({ version: 1, requestId: "b", handle, api: "GM_getValue", params: [] }, registry)
    ).toThrow(PageRpcError);

    const activeHandle = registry.register("script-a", "it", ["GM_getValue"]);
    expect(
      validatePageGMRequest(
        { version: 1, requestId: "c", handle: activeHandle, api: "GM_getValue", params: [] },
        registry
      )
    ).toMatchObject({
      uuid: "script-a",
      envTag: "it",
    });
    expect(() =>
      validatePageGMRequest(
        { version: 1, requestId: "d", handle: activeHandle, uuid: "script-b", api: "GM_getValue", params: [] },
        registry
      )
    ).toThrow(PageRpcError);
  });

  it("rejects APIs outside the binding and packets with accessors or unsupported values", () => {
    const registry = new PageRpcRegistry();
    const handle = registry.register("script-a", "it", ["GM_getValue"]);
    const accessorRequest = {
      version: 1,
      requestId: "a",
      handle,
      api: "GM_getValue",
      params: [],
    };
    Object.defineProperty(accessorRequest, "api", { get: () => "GM_getValue" });

    expect(() => validatePageGMRequest(accessorRequest, registry)).toThrow(PageRpcError);
    expect(() =>
      validatePageGMRequest({ version: 1, requestId: "b", handle, api: "GM_setValue", params: [] }, registry)
    ).toThrow(PageRpcError);
    expect(() =>
      validatePageGMRequest(
        {
          version: 1,
          requestId: "c",
          handle,
          api: "GM_getValue",
          params: [() => undefined],
        },
        registry
      )
    ).toThrow(PageRpcError);
  });

  it("rejects accessors nested in collection RPC parameters", () => {
    const registry = new PageRpcRegistry();
    const handle = registry.register("script-a", "it", ["GM_getValue"]);
    const getter = vi.fn(() => "secret");
    const nested = {} as Record<string, unknown>;
    Object.defineProperty(nested, "value", { configurable: true, enumerable: true, get: getter });

    expect(() =>
      validatePageGMRequest(
        { version: 1, requestId: "collection", handle, api: "GM_getValue", params: [new Map([["nested", nested]])] },
        registry
      )
    ).toThrow(PageRpcError);
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects accessors nested in set RPC parameters", () => {
    const registry = new PageRpcRegistry();
    const handle = registry.register("script-a", "it", ["GM_getValue"]);
    const getter = vi.fn(() => "secret");
    const nested = {} as Record<string, unknown>;
    Object.defineProperty(nested, "value", { configurable: true, enumerable: true, get: getter });

    expect(() =>
      validatePageGMRequest(
        { version: 1, requestId: "set", handle, api: "GM_getValue", params: [new Set([nested])] },
        registry
      )
    ).toThrow(PageRpcError);
    expect(getter).not.toHaveBeenCalled();
  });

  it("does not execute a Symbol.toStringTag accessor while validating RPC values", () => {
    const registry = new PageRpcRegistry();
    const handle = registry.register("script-a", "it", ["GM_getValue"]);
    const getter = vi.fn(() => "Blob");
    const nested = Object.create(null) as Record<PropertyKey, unknown>;
    Object.defineProperty(nested, Symbol.toStringTag, { configurable: true, get: getter });

    expect(() =>
      validatePageGMRequest({ version: 1, requestId: "tag", handle, api: "GM_getValue", params: [nested] }, registry)
    ).toThrow(PageRpcError);
    expect(getter).not.toHaveBeenCalled();
  });

  it("keeps validation on captured intrinsics after page prototype hooks", () => {
    const registry = new PageRpcRegistry();
    const handle = registry.register("script-a", "it", ["GM_getValue"]);
    const ownKeysSpy = vi.spyOn(Reflect, "ownKeys").mockImplementation(() => {
      throw new Error("page hook");
    });
    const descriptorSpy = vi.spyOn(Object, "getOwnPropertyDescriptor").mockImplementation(() => {
      throw new Error("page hook");
    });

    let result: ReturnType<typeof validatePageGMRequest> | undefined;
    try {
      result = validatePageGMRequest(
        { version: 1, requestId: "hooked", handle, api: "GM_getValue", params: [] },
        registry
      );
    } finally {
      ownKeysSpy.mockRestore();
      descriptorSpy.mockRestore();
    }
    expect(result).toMatchObject({ uuid: "script-a", envTag: "it" });
  });

  it("rejects malformed parameters for privileged helper operations", () => {
    const registry = new PageRpcRegistry();
    const handle = registry.register("script-a", "it", ["CAT_fetchBlob"]);

    expect(() =>
      validatePageGMRequest({ version: 1, requestId: "a", handle, api: "CAT_fetchBlob", params: [42] }, registry)
    ).toThrow("CAT_fetchBlob expects an extension blob URL");

    expect(isExtensionBlobUrl("https://example.com/file")).toBe(false);
    const extensionBlobUrl = `blob:${chrome.runtime.getURL("/").replace(/\/$/, "")}/internal`;
    expect(isExtensionBlobUrl(extensionBlobUrl)).toBe(true);

    expect(
      validatePageGMRequest(
        { version: 1, requestId: "b", handle, api: "CAT_fetchBlob", params: [extensionBlobUrl] },
        registry
      ).params
    ).toEqual([extensionBlobUrl]);
    expect(isExtensionBlobUrl("blob:https://example.com/internal")).toBe(false);
    expect(isExtensionBlobUrl("blob:chrome-extension://other/internal")).toBe(false);
  });

  it("requires a Blob for CAT_createBlobUrl after parameter cloning", () => {
    const registry = new PageRpcRegistry();
    const handle = registry.register("script-a", "it", ["CAT_createBlobUrl"]);

    expect(() =>
      validatePageGMRequest(
        { version: 1, requestId: "object", handle, api: "CAT_createBlobUrl", params: [{}] },
        registry
      )
    ).toThrow("CAT_createBlobUrl expects one Blob value");

    const blob = new NodeBlob(["payload"], { type: "text/plain" });
    expect(Object.prototype.toString.call(blob)).toBe("[object Blob]");
    expect(Object.prototype.toString.call(structuredClone(blob))).toBe("[object Blob]");
    const request = validatePageGMRequest(
      { version: 1, requestId: "blob", handle, api: "CAT_createBlobUrl", params: [blob] },
      registry
    );
    expect(Object.prototype.toString.call(request.params[0])).toBe("[object Blob]");
    expect(request.params[0]).not.toBe(blob);
  });

  it("validates extension blobs in USER_SCRIPT when runtime.getURL is unavailable", () => {
    const runtime = chrome.runtime as unknown as { getURL?: typeof chrome.runtime.getURL };
    const getURL = runtime.getURL;
    const extensionBlobUrl = `blob:chrome-extension://${chrome.runtime.id}/internal`;
    try {
      runtime.getURL = undefined;
      setPageRpcExtensionOrigin({ protocol: "chrome-extension:", hostname: chrome.runtime.id, port: "" });
      expect(isExtensionBlobUrl(extensionBlobUrl)).toBe(true);
      expect(isExtensionBlobUrl("blob:https://example.com/internal")).toBe(false);
    } finally {
      runtime.getURL = getURL;
      setPageRpcExtensionOrigin(undefined);
    }
  });

  it("bounds the replay window for each execution binding", () => {
    const registry = new PageRpcRegistry();
    const handle = registry.register("script-a", "it", ["GM_getValue"]);

    for (let index = 0; index <= 4096; index += 1) {
      validatePageGMRequest(
        { version: 1, requestId: `request-${index}`, handle, api: "GM_getValue", params: [] },
        registry
      );
    }

    // The oldest ID leaves the bounded replay window once newer requests arrive.
    expect(() =>
      validatePageGMRequest({ version: 1, requestId: "request-0", handle, api: "GM_getValue", params: [] }, registry)
    ).not.toThrow();
  });
});
