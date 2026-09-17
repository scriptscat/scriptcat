import { describe, expect, it } from "vitest";
import { getPageRpcAllowedAPIs, PageRpcError, PageRpcRegistry, validatePageGMRequest } from "./page_rpc";

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
        "CAT_fetchDocument",
      ])
    );
    expect(allowed).not.toContain("CAT_agentSkills");
  });

  it("includes APIs exposed through the same dependency graph as the script context", () => {
    const allowed = getPageRpcAllowedAPIs(["GM.openInTab"]);

    expect(allowed).toEqual(expect.arrayContaining(["GM.openInTab", "GM_openInTab", "GM_closeInTab"]));
  });

  it("allows the internal request name used by the GM.xmlHttpRequest wrapper", () => {
    const allowed = getPageRpcAllowedAPIs(["GM.xmlHttpRequest"]);

    expect(allowed).toContain("GM_xmlhttpRequest");
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
    ).toThrow("CAT_fetchBlob expects a URL string");

    expect(
      validatePageGMRequest(
        { version: 1, requestId: "a", handle, api: "CAT_fetchBlob", params: ["https://example.com/file"] },
        registry
      ).params
    ).toEqual(["https://example.com/file"]);
  });
});
