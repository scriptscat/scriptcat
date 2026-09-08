import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_USER_RULES } from "@App/app/service/service_worker/dnr_rule_ids";
import {
  NetworkRuleStateDAO,
  NetworkRuleStorageError,
  NetworkRuleStorageReadError,
  NetworkRuleValidationError,
  DEFAULT_NETWORK_RULE_STATE,
  cspRemovalAction,
  type NetworkRule,
  type NetworkRuleState,
  validateNetworkRuleState,
} from "./network_rule";

function rule(id: string, overrides: Partial<NetworkRule> = {}): NetworkRule {
  return {
    id,
    name: id,
    enabled: true,
    condition: { requestDomains: [`${id}.example.com`] },
    action: cspRemovalAction(),
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function state(rules: NetworkRule[], overrides: Partial<NetworkRuleState> = {}): NetworkRuleState {
  return { ...DEFAULT_NETWORK_RULE_STATE, rules, order: rules.map((item) => item.id), ...overrides };
}

describe("NetworkRuleStateDAO", () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
  });

  it("缺失 storage key 时使用 revision 0 默认 state 且不写入 storage", async () => {
    const dao = new NetworkRuleStateDAO();
    expect(await dao.getState()).toBeUndefined();
    expect(await chrome.storage.local.get()).toEqual({});
    expect(DEFAULT_NETWORK_RULE_STATE).toEqual({
      schemaVersion: 1,
      revision: 0,
      masterEnabled: true,
      rules: [],
      order: [],
    });
  });

  it("storage read 返回 runtime.lastError 时拒绝，而不是伪装成缺失 state", async () => {
    vi.spyOn(chrome.storage.local, "get").mockImplementationOnce(((
      _key: string,
      callback: (result: Record<string, unknown>) => void
    ) => {
      const lastError = { message: "storage unavailable" };
      Object.defineProperty(chrome.runtime, "lastError", { configurable: true, value: lastError });
      callback({});
      delete (chrome.runtime as unknown as Record<string, unknown>).lastError;
    }) as never);

    await expect(new NetworkRuleStateDAO().getState()).rejects.toBeInstanceOf(NetworkRuleStorageReadError);
  });

  it("保存后重新读取完整 state 并完成 round-trip", async () => {
    const dao = new NetworkRuleStateDAO();
    const saved = state([rule("one")], { revision: 1 });
    await dao.saveState(saved);
    expect(await dao.getState()).toEqual(saved);
  });

  it("storage 往返重排对象键序时保存仍算成功", async () => {
    const dao = new NetworkRuleStateDAO();
    const saved = state([rule("one")], { revision: 1 });

    await expect(dao.saveState(saved)).resolves.toBeUndefined();

    const readBack = await dao.getState();
    expect(readBack).toEqual(saved);
    // 真实 chrome.storage.local 会重排键序；mock 若退回保序，本用例会退化成同义反复，故在此钉住。
    expect(Object.keys(readBack!.rules[0])).toEqual([...Object.keys(saved.rules[0])].sort());
    expect(Object.keys(saved.rules[0])).not.toEqual([...Object.keys(saved.rules[0])].sort());
  });

  it("storage set 报告 runtime.lastError 时保存失败", async () => {
    vi.spyOn(chrome.storage.local, "set").mockImplementationOnce(((_items: unknown, callback: () => void) => {
      const lastError = { message: "QUOTA_BYTES quota exceeded" };
      Object.defineProperty(chrome.runtime, "lastError", { configurable: true, value: lastError });
      callback();
      delete (chrome.runtime as unknown as Record<string, unknown>).lastError;
    }) as never);

    await expect(new NetworkRuleStateDAO().saveState(state([rule("one")], { revision: 1 }))).rejects.toBeInstanceOf(
      NetworkRuleStorageError
    );
  });
});

describe("网络规则 state 结构校验", () => {
  it("未知 schema 不会通过完整结构校验", () => {
    expect(() => validateNetworkRuleState({ schemaVersion: 2 })).toThrowError(NetworkRuleValidationError);
  });

  it("order 必须是规则 ID 的完整排列", () => {
    const rules = [rule("a"), rule("b")];
    expect(() => validateNetworkRuleState(state(rules, { order: ["a"] }))).toThrowError(NetworkRuleValidationError);
    expect(() => validateNetworkRuleState(state(rules, { order: ["a", "a"] }))).toThrowError(
      NetworkRuleValidationError
    );
    expect(() => validateNetworkRuleState(state(rules, { order: ["a", "ghost"] }))).toThrowError(
      NetworkRuleValidationError
    );
    expect(() => validateNetworkRuleState(state(rules, { order: ["b", "a"] }))).not.toThrow();
  });

  it("改写请求头时拒绝 Cookie / Authorization / Host / Origin", () => {
    for (const header of ["cookie", "authorization", "host", "origin"]) {
      expect(() =>
        validateNetworkRuleState(
          state([rule("h", { action: { type: "modifyRequestHeaders", headers: [{ header, operation: "remove" }] } })])
        )
      ).toThrowError(NetworkRuleValidationError);
    }
    expect(() =>
      validateNetworkRuleState(
        state([
          rule("h", {
            action: { type: "modifyRequestHeaders", headers: [{ header: "x-flag", operation: "set", value: "1" }] },
          }),
        ])
      )
    ).not.toThrow();
  });

  it("移除 CSP 预设携带四个 CSP 头，X-Frame-Options 可选附带", () => {
    expect(cspRemovalAction()).toEqual({
      type: "removeResponseHeaders",
      headers: [
        "content-security-policy",
        "content-security-policy-report-only",
        "x-content-security-policy",
        "x-webkit-csp",
      ],
    });
    const withXFrameOptions = cspRemovalAction(true);
    expect(withXFrameOptions.type === "removeResponseHeaders" ? withXFrameOptions.headers : []).toContain(
      "x-frame-options"
    );
  });

  it("条件缺少匹配式、动作字段非法或规则数超过保留段容量时拒绝", () => {
    expect(() => validateNetworkRuleState(state([rule("n", { condition: {} })]))).toThrowError(
      NetworkRuleValidationError
    );
    expect(() =>
      validateNetworkRuleState(state([rule("n", { action: { type: "redirect", url: "javascript:0" } })]))
    ).toThrowError(NetworkRuleValidationError);
    expect(() =>
      validateNetworkRuleState(state([rule("n", { action: { type: "redirect", url: "https://example.com/" } })]))
    ).not.toThrow();
    expect(() =>
      validateNetworkRuleState({ ...DEFAULT_NETWORK_RULE_STATE, rules: new Array(MAX_USER_RULES + 1).fill(rule("n")) })
    ).toThrowError(NetworkRuleValidationError);
  });

  it("域名必须已规范化且同一列表内不重复", () => {
    expect(() =>
      validateNetworkRuleState(state([rule("n", { condition: { requestDomains: ["Example.com"] } })]))
    ).toThrowError(NetworkRuleValidationError);
    expect(() =>
      validateNetworkRuleState(
        state([rule("n", { condition: { requestDomains: ["a.example.com", "a.example.com"] } })])
      )
    ).toThrowError(NetworkRuleValidationError);
  });
});
