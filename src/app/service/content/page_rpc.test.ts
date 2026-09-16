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

  it("accepts a request for the active execution binding and clones parameters", () => {
    const registry = new PageRpcRegistry();
    const handle = registry.register("script-a", "it", ["GM_getValue"], undefined, "canonical-run");
    const params = { nested: { value: 1 } };

    const request = validatePageGMRequest(
      {
        version: 1,
        requestId: "request-a",
        handle,
        uuid: "script-a",
        envTag: "it",
        api: "GM_getValue",
        params: [params],
      },
      registry
    );

    expect(request).toEqual({
      version: 1,
      requestId: "request-a",
      handle,
      uuid: "script-a",
      envTag: "it",
      api: "GM_getValue",
      params: [params],
      runFlag: "canonical-run",
    });
    expect(request.params[0]).not.toBe(params);
  });

  it("rejects an unknown, stale, or mismatched execution binding", () => {
    const registry = new PageRpcRegistry();
    const handle = registry.register("script-a", "it", ["GM_getValue"]);

    expect(() =>
      validatePageGMRequest(
        {
          version: 1,
          requestId: "a",
          handle: "missing",
          uuid: "script-a",
          envTag: "it",
          api: "GM_getValue",
          params: [],
        },
        registry
      )
    ).toThrow(PageRpcError);

    registry.revoke(handle);
    expect(() =>
      validatePageGMRequest(
        { version: 1, requestId: "b", handle, uuid: "script-a", envTag: "it", api: "GM_getValue", params: [] },
        registry
      )
    ).toThrow(PageRpcError);

    const activeHandle = registry.register("script-a", "it", ["GM_getValue"]);
    expect(() =>
      validatePageGMRequest(
        {
          version: 1,
          requestId: "c",
          handle: activeHandle,
          uuid: "script-b",
          envTag: "it",
          api: "GM_getValue",
          params: [],
        },
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
      uuid: "script-a",
      envTag: "it",
      api: "GM_getValue",
      params: [],
    };
    Object.defineProperty(accessorRequest, "api", { get: () => "GM_getValue" });

    expect(() => validatePageGMRequest(accessorRequest, registry)).toThrow(PageRpcError);
    expect(() =>
      validatePageGMRequest(
        { version: 1, requestId: "b", handle, uuid: "script-a", envTag: "it", api: "GM_setValue", params: [] },
        registry
      )
    ).toThrow(PageRpcError);
    expect(() =>
      validatePageGMRequest(
        {
          version: 1,
          requestId: "c",
          handle,
          uuid: "script-a",
          envTag: "it",
          api: "GM_getValue",
          params: [() => undefined],
        },
        registry
      )
    ).toThrow(PageRpcError);
  });
});
