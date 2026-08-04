import { describe, expect, it } from "vitest";
import { decodeWireEnvelope } from "./protocol-wire";

describe("Schema-driven RPC wire boundary", () => {
  it("parses JSON-RPC requests and responses directly", () => {
    expect(
      decodeWireEnvelope(JSON.stringify({ jsonrpc: "2.0", id: "r1", method: "$session.ping", params: {} }))
    ).toMatchObject({ id: "r1", method: "$session.ping" });
    expect(decodeWireEnvelope(JSON.stringify({ jsonrpc: "2.0", id: "r1", result: {} }))).toMatchObject({
      id: "r1",
      result: {},
    });
  });

  it("rejects method params that do not satisfy the sctl-owned schema", () => {
    const frame = JSON.stringify({
      jsonrpc: "2.0",
      id: "26d146ee-6d26-4bf6-9fe8-1e86d1582811",
      method: "scripts.toggle.request",
      params: {
        input: { uuid: "26d146ee-6d26-4bf6-9fe8-1e86d1582811", enable: "yes" },
      },
    });

    expect(() => decodeWireEnvelope(frame)).toThrow(/scripts\.toggle\.request/);
  });

  it("validates nested values, collection limits, and additional properties without runtime compilation", () => {
    const request = {
      jsonrpc: "2.0",
      id: "r1",
      method: "scripts.edit.request",
      params: {
        input: {
          uuid: "26d146ee-6d26-4bf6-9fe8-1e86d1582811",
          edits: [{ oldText: "before", newText: "after", replaceAll: true }],
        },
      },
    };

    expect(decodeWireEnvelope(JSON.stringify(request))).toMatchObject(request);
    expect(() =>
      decodeWireEnvelope(JSON.stringify({ ...request, params: { input: { ...request.params.input, edits: [] } } }))
    ).toThrow(/scripts\.edit\.request/);
    expect(() =>
      decodeWireEnvelope(
        JSON.stringify({
          ...request,
          params: {
            input: {
              ...request.params.input,
              edits: [{ oldText: "before", newText: "after", unexpected: true }],
            },
          },
        })
      )
    ).toThrow(/scripts\.edit\.request/);
  });
});
