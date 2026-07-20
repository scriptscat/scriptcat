import { beforeEach, describe, expect, it, vi, type Mocked } from "vitest";
import type { Group } from "@Packages/message/server";
import type { IMessageQueue } from "@Packages/message/message_queue";
import {
  CspRuleStorageReadError,
  DEFAULT_CSP_RULE_STATE,
  type CspRuleState,
  type CspRuleStateDAO,
} from "@App/app/repo/csp_rule";
import { CspRuleService, type CspRuleApplier } from "./csp_rule";
import { compileCspRules } from "./csp_rule_compiler";

type Handler = (params?: unknown) => Promise<unknown>;

function createHarness(initialState?: CspRuleState, getStateError?: unknown) {
  const handlers = new Map<string, Handler>();
  const group = {
    on: vi.fn((name: string, handler: Handler) => handlers.set(name, handler)),
  } as unknown as Group;
  const queue = {
    publish: vi.fn(),
  } as unknown as IMessageQueue;
  const dao = {
    state: initialState,
    getState: vi.fn(async () => {
      if (getStateError) throw getStateError;
      return dao.state;
    }),
    saveState: vi.fn(async (state: CspRuleState) => {
      dao.state = state;
      return state;
    }),
  } as unknown as CspRuleStateDAO & { state: CspRuleState | undefined };
  let daoMutationQueue = Promise.resolve();
  (dao as CspRuleStateDAO & { runExclusive: <T>(operation: () => Promise<T>) => Promise<T> }).runExclusive = <T>(
    operation: () => Promise<T>
  ) => {
    const next = daoMutationQueue.then(operation);
    daoMutationQueue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  };
  const applier = {
    apply: vi.fn(async () => {}),
  } as Mocked<CspRuleApplier>;
  const service = new CspRuleService(group, queue, dao, compileCspRules, applier);
  service.init();
  return { service, handlers, group, queue, dao, applier };
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

  it("状态广播失败时仍返回已保存的 mutation 结果", async () => {
    const { handlers, queue, dao } = createHarness();
    vi.mocked(queue.publish).mockImplementation(() => {
      throw new Error("receiver unavailable");
    });
    const initial = (await handlers.get("getState")!()) as { state: CspRuleState };

    const result = await handlers.get("createRule")!({
      baseRevision: initial.state.revision,
      name: "Example",
      enabled: true,
      target: { type: "domains", domains: ["example.com"] },
    });

    expect(result).toMatchObject({ outcome: "applied", state: { revision: 1 } });
    expect(dao.state?.rules).toHaveLength(1);
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

  it("storage read 失败时返回 storage_read_failed 且不清空已应用规则", async () => {
    const { handlers, applier } = createHarness(undefined, new CspRuleStorageReadError());

    await expect(handlers.get("getState")!()).rejects.toMatchObject({ code: "storage_read_failed" });
    expect(applier.apply).not.toHaveBeenCalled();
  });

  it("启动清理失败后可通过 retryApply 恢复，不会被失败的 ready 永久阻塞", async () => {
    const { handlers, dao, applier } = createHarness({ schemaVersion: 2 } as unknown as CspRuleState);
    applier.apply.mockRejectedValueOnce(new Error("temporary DNR failure"));

    await expect(handlers.get("getState")!()).rejects.toMatchObject({ code: "unsupported_schema" });
    dao.state = undefined;
    const retried = (await handlers.get("retryApply")!()) as { outcome: string; state: CspRuleState };

    expect(retried.outcome).toBe("applied");
    expect(retried.state.revision).toBe(0);
    expect(applier.apply).toHaveBeenCalledTimes(2);
    expect(applier.apply).toHaveBeenNthCalledWith(1, []);
    expect(applier.apply).toHaveBeenNthCalledWith(2, []);
  });

  it("两个共享 DAO 的 service instance 竞争同一 revision 时不会静默覆盖", async () => {
    const first = createHarness();
    const secondHandlers = new Map<string, Handler>();
    const secondGroup = {
      on: vi.fn((name: string, handler: Handler) => secondHandlers.set(name, handler)),
    } as unknown as Group;
    const secondQueue = { publish: vi.fn() } as unknown as IMessageQueue;
    const secondService = new CspRuleService(secondGroup, secondQueue, first.dao, compileCspRules, first.applier);
    secondService.init();
    const firstInitial = (await first.handlers.get("getState")!()) as { state: CspRuleState };
    const secondInitial = (await secondHandlers.get("getState")!()) as { state: CspRuleState };

    const firstMutation = first.handlers.get("createRule")!({
      baseRevision: firstInitial.state.revision,
      enabled: true,
      target: { type: "domains", domains: ["first.example"] },
    });
    const secondMutation = secondHandlers.get("createRule")!({
      baseRevision: secondInitial.state.revision,
      enabled: true,
      target: { type: "domains", domains: ["second.example"] },
    });
    const results = await Promise.allSettled([firstMutation, secondMutation]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      status: "rejected",
      reason: { code: "revision_conflict" },
    });
    expect(first.dao.state?.rules).toHaveLength(1);
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
