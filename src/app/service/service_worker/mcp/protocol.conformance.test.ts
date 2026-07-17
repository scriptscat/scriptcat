import { describe, it, expect } from "vitest";
import protocolJson from "./protocol.json";
import * as extTypes from "./types";

// protocol.json 是桥接协议常量的唯一权威(与 scriptscat/sctl 仓库逐字节同步);types.ts 是
// 扩展侧的强类型镜像。本测试是漂移守卫:任一侧改了协议而没同步另一侧,就在这里失败,而不是
// 运行时才与 daemon 静默失配。
describe("MCP 协议一致性 - types.ts 必须与 protocol.json 同步", () => {
  it("PROTOCOL_VERSION 与 protocol.json 一致", () => {
    expect(extTypes.PROTOCOL_VERSION).toBe(protocolJson.protocolVersion);
  });

  it("MIN_HOST_VERSION 与 protocol.json 的 minDaemonVersion 一致", () => {
    expect(extTypes.MIN_HOST_VERSION).toBe(protocolJson.versions.minDaemonVersion);
  });

  it("envelope 类型集合完全一致(顺序无关)", () => {
    expect([...extTypes.NATIVE_MESSAGE_TYPES].sort()).toEqual([...protocolJson.envelopeTypes].sort());
  });

  it("MCP_SCOPES 与 protocol.json 的 scopes 完全一致", () => {
    expect([...extTypes.MCP_SCOPES].sort()).toEqual([...protocolJson.scopes].sort());
  });

  it("BRIDGE_ACTIONS 与 protocol.json 的 actions 键完全一致", () => {
    expect([...extTypes.BRIDGE_ACTIONS].sort()).toEqual(Object.keys(protocolJson.actions).sort());
  });

  it("BRIDGE_ERROR_CODES 与 protocol.json 的 errorCodes 完全一致", () => {
    expect([...extTypes.BRIDGE_ERROR_CODES].sort()).toEqual([...protocolJson.errorCodes].sort());
  });

  it("每个 action 的 required scope 与 protocol.json 声明一致", () => {
    for (const [action, meta] of Object.entries(protocolJson.actions)) {
      expect(extTypes.ACTION_REQUIRED_SCOPE[action as extTypes.BridgeAction]).toBe(meta.scope);
    }
  });

  it("WRITE_ACTIONS 与 protocol.json 中 write=true 的 action 完全一致", () => {
    const writeActions = Object.entries(protocolJson.actions)
      .filter(([, meta]) => meta.write)
      .map(([action]) => action);
    expect([...extTypes.WRITE_ACTIONS].sort()).toEqual(writeActions.sort());
  });

  it("每个 write action 都要求写入类 scope(命名以 :request 结尾)", () => {
    for (const action of extTypes.WRITE_ACTIONS) {
      expect(extTypes.ACTION_REQUIRED_SCOPE[action]).toMatch(/:request$/);
    }
  });
});
