import { describe, expect, it } from "vitest";
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
