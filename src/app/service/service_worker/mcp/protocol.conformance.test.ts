import { describe, it, expect } from "vitest";
import * as hostProtocol from "@Packages/native-messaging-host/src/shared/protocol";
import * as extTypes from "./types";

// The host package (packages/native-messaging-host) and the extension do not share a build
// graph — types.ts is an independently maintained mirror of protocol.ts, and both are meant to
// be normative for their respective sides. This test is the drift guard: any protocol change
// made on one side without the other fails here instead of silently desyncing at runtime.
describe("MCP 协议一致性 - 两侧独立副本必须同步", () => {
  it("PROTOCOL_VERSION 一致", () => {
    expect(extTypes.PROTOCOL_VERSION).toBe(hostProtocol.PROTOCOL_VERSION);
  });

  it("NATIVE_MESSAGE_TYPES 完全一致（含顺序无关性）", () => {
    expect([...extTypes.NATIVE_MESSAGE_TYPES].sort()).toEqual([...hostProtocol.NATIVE_MESSAGE_TYPES].sort());
  });

  it("MCP_SCOPES 完全一致", () => {
    expect([...extTypes.MCP_SCOPES].sort()).toEqual([...hostProtocol.MCP_SCOPES].sort());
  });

  it("BRIDGE_ACTIONS 完全一致", () => {
    expect([...extTypes.BRIDGE_ACTIONS].sort()).toEqual([...hostProtocol.BRIDGE_ACTIONS].sort());
  });

  it("BRIDGE_ERROR_CODES 完全一致", () => {
    expect([...extTypes.BRIDGE_ERROR_CODES].sort()).toEqual([...hostProtocol.BRIDGE_ERROR_CODES].sort());
  });

  it("OPERATION_KINDS 完全一致", () => {
    expect([...extTypes.OPERATION_KINDS].sort()).toEqual([...hostProtocol.OPERATION_KINDS].sort());
  });

  it("OPERATION_STATUSES 完全一致", () => {
    expect([...extTypes.OPERATION_STATUSES].sort()).toEqual([...hostProtocol.OPERATION_STATUSES].sort());
  });

  it("ACTION_REQUIRED_SCOPE 的每个 action 在两侧映射到相同的 scope", () => {
    for (const action of hostProtocol.BRIDGE_ACTIONS) {
      expect(extTypes.ACTION_REQUIRED_SCOPE[action]).toBe(hostProtocol.ACTION_REQUIRED_SCOPE[action]);
    }
  });

  it("WRITE_ACTIONS 完全一致", () => {
    expect([...extTypes.WRITE_ACTIONS].sort()).toEqual([...hostProtocol.WRITE_ACTIONS].sort());
  });

  it("每个 write action 都要求写入类 scope（scopes 命名以 :request 结尾）", () => {
    for (const action of hostProtocol.WRITE_ACTIONS) {
      expect(hostProtocol.ACTION_REQUIRED_SCOPE[action]).toMatch(/:request$/);
    }
  });

  it("ID 生成约定：本规范不允许顺序/可预测 ID（协议本身不生成 ID，仅作为文档化断言存在）", () => {
    // Sequential IDs (e.g. "session_1") are forbidden — every ID (requestId, operationId,
    // clientId, session nonces) must be cryptographically random. This is a
    // documentation-anchoring test: real randomness is exercised in the host package's own
    // auth/pairing tests (packages/native-messaging-host/src/auth/*.test.ts); here we just
    // assert the schema types model IDs as opaque strings, not numeric/sequential fields.
    const sampleRequest: hostProtocol.McpBridgeRequest = {
      requestId: "test-id",
      protocolVersion: hostProtocol.PROTOCOL_VERSION,
      clientId: "client-id",
      action: "scripts.list",
      input: {},
    };
    expect(typeof sampleRequest.requestId).toBe("string");
    expect(typeof sampleRequest.clientId).toBe("string");
  });
});
