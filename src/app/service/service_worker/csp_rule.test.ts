import { beforeEach, describe, expect, it, vi, type Mocked } from "vitest";
import type { Group } from "@Packages/message/server";
import type { IMessageQueue } from "@Packages/message/message_queue";
import { DEFAULT_CSP_RULE_STATE, type CspRuleState, type CspRuleStateDAO } from "@App/app/repo/csp_rule";
import { CspRuleService, type CspRuleApplier } from "./csp_rule";
import { compileCspRules } from "./csp_rule_compiler";

type Handler = (params?: unknown) => Promise<unknown>;

function createHarness(initialState?: CspRuleState) {
  const handlers = new Map<string, Handler>();
  const group = {
    on: vi.fn((name: string, handler: Handler) => handlers.set(name, handler)),
  } as unknown as Group;
  const queue = {
    publish: vi.fn(),
  } as unknown as IMessageQueue;
  const dao = {
    state: initialState,
    getState: vi.fn(async () => dao.state),
    saveState: vi.fn(async (state: CspRuleState) => {
      dao.state = state;
      return state;
    }),
  } as unknown as CspRuleStateDAO & { state: CspRuleState | undefined };
  const applier = {
    apply: vi.fn(async () => {}),
  } as Mocked<CspRuleApplier>;
  const service = new CspRuleService(group, queue, dao, compileCspRules, applier);
  service.init();
  return { service, handlers, queue, dao, applier };
}

describe("CspRuleService", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("初始化时按持久化 state 重建规则", async () => {
    const state: CspRuleState = {
      ...DEFAULT_CSP_RULE_STATE,
      revision: 4,
      rules: [
        {
          id: "one",
          name: "example.com",
          enabled: true,
          target: { type: "domains", domains: ["example.com"] },
          action: { type: "removeCspHeaders" },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
    const { handlers, applier } = createHarness(state);
    const snapshot = await handlers.get("getState")!();
    expect(snapshot).toMatchObject({ state, apply: { state: "applied", revision: 4 } });
    expect(applier.apply).toHaveBeenCalledWith(compileCspRules(state));
  });

  it("创建规则会持久化、应用并发布新的 snapshot", async () => {
    const { handlers, queue, dao } = createHarness();
    const initial = (await handlers.get("getState")!()) as { state: CspRuleState };
    const result = (await handlers.get("createRule")!({
      baseRevision: initial.state.revision,
      name: "Example",
      enabled: true,
      target: { type: "domains", domains: ["https://Example.com/path"] },
    })) as { outcome: string; state: CspRuleState };
    expect(result.outcome).toBe("applied");
    expect(result.state.revision).toBe(1);
    expect(result.state.rules[0].target).toEqual({ type: "domains", domains: ["example.com"] });
    expect(dao.saveState).toHaveBeenCalledOnce();
    expect(queue.publish).toHaveBeenCalledWith(
      "cspRule/stateChanged",
      expect.objectContaining({ state: result.state })
    );
  });

  it("baseRevision 过期时返回 revision conflict 且不覆盖其他页面的修改", async () => {
    const { handlers, dao, applier } = createHarness();
    const initial = (await handlers.get("getState")!()) as { state: CspRuleState };
    await handlers.get("createRule")!({
      baseRevision: initial.state.revision,
      enabled: true,
      target: { type: "domains", domains: ["example.com"] },
    });
    const before = dao.state;
    await expect(
      handlers.get("deleteRule")!({ baseRevision: initial.state.revision, id: before!.rules[0].id })
    ).rejects.toMatchObject({ code: "revision_conflict" });
    expect(dao.state).toBe(before);
    expect(applier.apply).toHaveBeenCalledTimes(2);
  });

  it("DNR 更新失败时保存 state 并返回可重试错误，retryApply 不增加 revision", async () => {
    const { handlers, applier } = createHarness();
    const initial = (await handlers.get("getState")!()) as { state: CspRuleState };
    applier.apply.mockRejectedValueOnce(new Error("permission denied"));
    const failed = (await handlers.get("createRule")!({
      baseRevision: initial.state.revision,
      enabled: true,
      target: { type: "domains", domains: ["example.com"] },
    })) as { outcome: string; state: CspRuleState; apply: { state: string; desiredRevision: number } };
    expect(failed.outcome).toBe("apply-error");
    expect(failed.apply).toMatchObject({ state: "error", desiredRevision: 1, lastAppliedRevision: 0 });
    applier.apply.mockResolvedValueOnce();
    const retried = (await handlers.get("retryApply")!()) as { outcome: string; state: CspRuleState };
    expect(retried.outcome).toBe("applied");
    expect(retried.state.revision).toBe(1);
  });

  it("未知 schema 保留数据并返回 unsupported_schema", async () => {
    const { handlers, applier } = createHarness({ schemaVersion: 2 } as unknown as CspRuleState);
    await expect(handlers.get("getState")!()).rejects.toMatchObject({ code: "unsupported_schema" });
    expect(applier.apply).toHaveBeenCalledWith([]);
  });

  it("并发 mutation 按保存与 reconcile 的完整顺序串行执行", async () => {
    const order: string[] = [];
    const { handlers, applier } = createHarness();
    applier.apply.mockImplementation(async () => {
      order.push("apply-start");
      await Promise.resolve();
      order.push("apply-end");
    });
    const first = handlers.get("getState")!();
    const initial = (await first) as { state: CspRuleState };
    const firstMutation = handlers.get("createRule")!({
      baseRevision: initial.state.revision,
      enabled: true,
      target: { type: "domains", domains: ["one.example"] },
    });
    const secondMutation = handlers.get("createRule")!({
      baseRevision: initial.state.revision,
      enabled: true,
      target: { type: "domains", domains: ["two.example"] },
    });
    await expect(firstMutation).resolves.toMatchObject({ outcome: "applied" });
    await expect(secondMutation).rejects.toMatchObject({ code: "revision_conflict" });
    expect(order).toEqual(["apply-start", "apply-end", "apply-start", "apply-end"]);
  });

  it("写后重新读取不一致时返回 storage error 且不调用 DNR", async () => {
    const { handlers, dao, applier } = createHarness();
    const initial = (await handlers.get("getState")!()) as { state: CspRuleState };
    vi.mocked(dao.saveState).mockResolvedValueOnce({ ...initial.state, revision: initial.state.revision + 99 });

    await expect(
      handlers.get("createRule")!({
        baseRevision: initial.state.revision,
        enabled: true,
        target: { type: "domains", domains: ["example.com"] },
      })
    ).rejects.toMatchObject({ code: "storage_write_failed" });
    expect(applier.apply).toHaveBeenCalledOnce();
  });
});
