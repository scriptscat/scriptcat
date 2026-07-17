import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CspRuleStateDAO,
  CspRuleStorageReadError,
  CspRuleValidationError,
  DEFAULT_CSP_RULE_STATE,
  type CspRuleState,
  validateCspRuleState,
} from "./csp_rule";

function rule(id: string, domains: string[]) {
  return {
    id,
    name: id,
    enabled: true,
    target: { type: "domains" as const, domains },
    action: { type: "removeCspHeaders" as const },
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("CspRuleStateDAO", () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
  });

  it("缺失 storage key 时使用 revision 0 默认 state 且不写入 storage", async () => {
    const dao = new CspRuleStateDAO();
    expect(await dao.getState()).toBeUndefined();
    expect(await chrome.storage.local.get()).toEqual({});
    expect(DEFAULT_CSP_RULE_STATE).toEqual({ schemaVersion: 1, revision: 0, masterEnabled: true, rules: [] });
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

    await expect(new CspRuleStateDAO().getState()).rejects.toBeInstanceOf(CspRuleStorageReadError);
  });

  it("保存后重新读取完整 state 并完成 round-trip", async () => {
    const dao = new CspRuleStateDAO();
    const state: CspRuleState = { ...DEFAULT_CSP_RULE_STATE, revision: 1 };
    expect(await dao.saveState(state)).toEqual(state);
    expect(await dao.getState()).toEqual(state);
  });

  it("未知 schema 不会通过完整结构校验", () => {
    expect(() => validateCspRuleState({ schemaVersion: 2 })).toThrowError(CspRuleValidationError);
  });

  it("规则数、单规则域名数和全局不同域名数超过上限时拒绝保存", () => {
    const tooManyRules = Array.from({ length: 101 }, (_, index) => rule(`rule-${index}`, [`${index}.example.com`]));
    expect(() => validateCspRuleState({ ...DEFAULT_CSP_RULE_STATE, rules: tooManyRules })).toThrowError(
      CspRuleValidationError
    );

    const tooManyDomains = Array.from({ length: 101 }, (_, index) => `${index}.example.com`);
    expect(() =>
      validateCspRuleState({ ...DEFAULT_CSP_RULE_STATE, rules: [rule("rule", tooManyDomains)] })
    ).toThrowError(CspRuleValidationError);

    const uniqueDomains = Array.from({ length: 11 }, (_, ruleIndex) =>
      rule(
        `rule-${ruleIndex}`,
        Array.from(
          { length: ruleIndex === 10 ? 1 : 100 },
          (_, domainIndex) => `${ruleIndex * 100 + domainIndex}.example.com`
        )
      )
    );
    expect(() => validateCspRuleState({ ...DEFAULT_CSP_RULE_STATE, rules: uniqueDomains })).toThrowError(
      CspRuleValidationError
    );
  });
});
