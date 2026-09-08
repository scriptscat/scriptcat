import { describe, it, expect } from "vitest";
import { ERROR_CODES, JSONRPC_VERSION, RPC_METHODS, SESSION_METHODS } from "./generated/protocol.generated";
import * as extTypes from "./types";

// sctl Schema 生成的 PROTOCOL 是桥接协议常量的唯一权威；types.ts 是
// 扩展侧的强类型镜像。本测试是漂移守卫:任一侧改了协议而没同步另一侧,就在这里失败,而不是
// 运行时才与 daemon 静默失配。
describe("MCP 协议一致性 - types.ts 必须与生成协议同步", () => {
  it("JSON-RPC version matches the generated contract", () => {
    expect(extTypes.JSONRPC_VERSION).toBe(JSONRPC_VERSION);
  });

  it("session methods match the generated contract", () => {
    expect([...extTypes.SESSION_METHODS].sort()).toEqual([...SESSION_METHODS].sort());
  });

  it("EXTERNAL_ACCESS_SCOPES 与 protocol.json 的 scopes 完全一致", () => {
    expect([...extTypes.EXTERNAL_ACCESS_SCOPES].sort()).toEqual(
      [...new Set(Object.values(RPC_METHODS).map((method) => method.scope))].sort()
    );
  });

  it("BRIDGE_ACTIONS 与 protocol.json 的 actions 键完全一致", () => {
    expect([...extTypes.BRIDGE_ACTIONS].sort()).toEqual(Object.keys(RPC_METHODS).sort());
  });

  it("BRIDGE_ERROR_CODES 与 protocol.json 的 errorCodes 完全一致", () => {
    expect([...extTypes.BRIDGE_ERROR_CODES].sort()).toEqual([...ERROR_CODES].sort());
  });

  it("每个 action 的 required scope 与 protocol.json 声明一致", () => {
    for (const [action, meta] of Object.entries(RPC_METHODS)) {
      expect(extTypes.ACTION_REQUIRED_SCOPE[action as extTypes.BridgeAction]).toBe(meta.scope);
    }
  });

  it("WRITE_ACTIONS 与 protocol.json 中 write=true 的 action 完全一致", () => {
    const writeActions = Object.entries(RPC_METHODS)
      .filter(([, meta]) => meta.effect === "write")
      .map(([action]) => action);
    expect([...extTypes.WRITE_ACTIONS].sort()).toEqual(writeActions.sort());
  });

  it("每个 write action 都要求写入类 scope(命名以 :request 结尾)", () => {
    for (const action of extTypes.WRITE_ACTIONS) {
      expect(extTypes.ACTION_REQUIRED_SCOPE[action]).toMatch(/:request$/);
    }
  });
});
