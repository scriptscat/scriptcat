import { beforeEach, describe, expect, it, vi, type Mocked } from "vitest";
import type { Group } from "@Packages/message/server";
import type { IMessageQueue } from "@Packages/message/message_queue";
import {
  NetworkRuleStorageReadError,
  DEFAULT_NETWORK_RULE_STATE,
  cspRemovalAction,
  type NetworkRuleState,
  type NetworkRuleStateDAO,
} from "@App/app/repo/network_rule";
import { NetworkRuleService, type NetworkRuleApplier } from "./network_rule";
import { compileNetworkRules } from "./network_rule_compiler";

type Handler = (params?: unknown) => Promise<unknown>;

const cspRule = { enabled: true, condition: { requestDomains: ["example.com"] }, action: cspRemovalAction() };

function createHarness(initialState?: NetworkRuleState, getStateError?: unknown) {
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
    saveState: vi.fn(async (state: NetworkRuleState) => {
      dao.state = state;
      return state;
    }),
  } as unknown as NetworkRuleStateDAO & { state: NetworkRuleState | undefined };
  let daoMutationQueue = Promise.resolve();
  (dao as NetworkRuleStateDAO & { runExclusive: <T>(operation: () => Promise<T>) => Promise<T> }).runExclusive = <T>(
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
  } as Mocked<NetworkRuleApplier>;
  const service = new NetworkRuleService(group, queue, dao, compileNetworkRules, applier);
  service.init();
  return { service, handlers, group, queue, dao, applier };
}

describe("NetworkRuleService", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("初始化时按持久化 state 重建规则", async () => {
    const state: NetworkRuleState = {
      ...DEFAULT_NETWORK_RULE_STATE,
      revision: 4,
      rules: [
        {
          id: "one",
          name: "example.com",
          enabled: true,
          condition: { requestDomains: ["example.com"] },
          action: cspRemovalAction(),
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      order: ["one"],
    };
    const { handlers, applier } = createHarness(state);
    const snapshot = await handlers.get("getState")!();
    expect(snapshot).toMatchObject({ state, apply: { state: "applied", revision: 4 } });
    expect(applier.apply).toHaveBeenCalledWith(compileNetworkRules(state));
  });

  it("创建规则会规范化输入、追加到顺序末尾并发布新的 snapshot", async () => {
    const { handlers, queue, dao } = createHarness();
    const initial = (await handlers.get("getState")!()) as { state: NetworkRuleState };
    const result = (await handlers.get("createRule")!({
      baseRevision: initial.state.revision,
      name: "Example",
      enabled: true,
      condition: { requestDomains: ["https://Example.com/path"] },
      action: { type: "removeResponseHeaders", headers: ["Content-Security-Policy"] },
    })) as { outcome: string; state: NetworkRuleState };
    expect(result.outcome).toBe("applied");
    expect(result.state.revision).toBe(1);
    expect(result.state.rules[0].condition).toEqual({ requestDomains: ["example.com"] });
    expect(result.state.rules[0].action).toEqual({
      type: "removeResponseHeaders",
      headers: ["content-security-policy"],
    });
    expect(result.state.order).toEqual([result.state.rules[0].id]);
    expect(dao.saveState).toHaveBeenCalledOnce();
    expect(queue.publish).toHaveBeenCalledWith(
      "networkRule/stateChanged",
      expect.objectContaining({ state: result.state })
    );
  });

  it("改写请求头命中黑名单时拒绝保存", async () => {
    const { handlers, dao } = createHarness();
    const initial = (await handlers.get("getState")!()) as { state: NetworkRuleState };
    await expect(
      handlers.get("createRule")!({
        baseRevision: initial.state.revision,
        enabled: true,
        condition: { requestDomains: ["example.com"] },
        action: { type: "modifyRequestHeaders", headers: [{ header: "Cookie", operation: "remove" }] },
      })
    ).rejects.toMatchObject({ code: "invalid_input", messageKey: "header_forbidden" });
    expect(dao.saveState).not.toHaveBeenCalled();
  });

  it("排序按新顺序重编译，非排列的顺序被拒绝", async () => {
    const { handlers, applier } = createHarness();
    let revision = 0;
    const ids: string[] = [];
    for (const domain of ["a.example.com", "b.example.com"]) {
      const created = (await handlers.get("createRule")!({
        ...cspRule,
        baseRevision: revision,
        condition: { requestDomains: [domain] },
      })) as { state: NetworkRuleState };
      revision = created.state.revision;
      ids.push(created.state.rules.at(-1)!.id);
    }

    await expect(handlers.get("reorderRules")!({ baseRevision: revision, order: [ids[0]] })).rejects.toMatchObject({
      code: "invalid_input",
      messageKey: "order_invalid",
    });

    const reordered = (await handlers.get("reorderRules")!({
      baseRevision: revision,
      order: [ids[1], ids[0]],
    })) as { outcome: string; state: NetworkRuleState };
    expect(reordered.outcome).toBe("applied");
    expect(reordered.state.order).toEqual([ids[1], ids[0]]);
    const compiled = applier.apply.mock.calls.at(-1)![0];
    expect(compiled.map((item) => item.condition.requestDomains)).toEqual([["b.example.com"], ["a.example.com"]]);
    expect(compiled[0].priority).toBeGreaterThan(compiled[1].priority!);
  });

  it("删除规则会同时移出顺序数组", async () => {
    const { handlers } = createHarness();
    const created = (await handlers.get("createRule")!({ ...cspRule, baseRevision: 0 })) as { state: NetworkRuleState };
    const id = created.state.rules[0].id;
    const deleted = (await handlers.get("deleteRule")!({ baseRevision: created.state.revision, id })) as {
      state: NetworkRuleState;
    };
    expect(deleted.state.rules).toEqual([]);
    expect(deleted.state.order).toEqual([]);
  });

  it("状态广播失败时仍返回已保存的 mutation 结果", async () => {
    const { handlers, queue, dao } = createHarness();
    vi.mocked(queue.publish).mockImplementation(() => {
      throw new Error("receiver unavailable");
    });
    const result = await handlers.get("createRule")!({ ...cspRule, baseRevision: 0, name: "Example" });

    expect(result).toMatchObject({ outcome: "applied", state: { revision: 1 } });
    expect(dao.state?.rules).toHaveLength(1);
  });

  it("baseRevision 过期时返回 revision conflict 且不覆盖其他页面的修改", async () => {
    const { handlers, dao, applier } = createHarness();
    await handlers.get("createRule")!({ ...cspRule, baseRevision: 0 });
    const before = dao.state;
    await expect(handlers.get("deleteRule")!({ baseRevision: 0, id: before!.rules[0].id })).rejects.toMatchObject({
      code: "revision_conflict",
    });
    expect(dao.state).toBe(before);
    expect(applier.apply).toHaveBeenCalledTimes(2);
  });

  it("DNR 更新失败时保存 state 并返回可重试错误，retryApply 不增加 revision", async () => {
    const { handlers, applier } = createHarness();
    await handlers.get("getState")!();
    applier.apply.mockRejectedValueOnce(new Error("permission denied"));
    const failed = (await handlers.get("createRule")!({ ...cspRule, baseRevision: 0 })) as {
      outcome: string;
      apply: { state: string; desiredRevision: number };
    };
    expect(failed.outcome).toBe("apply-error");
    expect(failed.apply).toMatchObject({ state: "error", desiredRevision: 1, lastAppliedRevision: 0 });
    applier.apply.mockResolvedValueOnce();
    const retried = (await handlers.get("retryApply")!()) as { outcome: string; state: NetworkRuleState };
    expect(retried.outcome).toBe("applied");
    expect(retried.state.revision).toBe(1);
  });

  it("未知 schema 保留数据并返回 unsupported_schema", async () => {
    const { handlers, applier } = createHarness({ schemaVersion: 2 } as unknown as NetworkRuleState);
    await expect(handlers.get("getState")!()).rejects.toMatchObject({ code: "unsupported_schema" });
    expect(applier.apply).toHaveBeenCalledWith([]);
  });

  it("storage read 失败时返回 storage_read_failed 且不清空已应用规则", async () => {
    const { handlers, applier } = createHarness(undefined, new NetworkRuleStorageReadError());

    await expect(handlers.get("getState")!()).rejects.toMatchObject({ code: "storage_read_failed" });
    expect(applier.apply).not.toHaveBeenCalled();
  });

  it("启动清理失败后可通过 retryApply 恢复，不会被失败的 ready 永久阻塞", async () => {
    const { handlers, dao, applier } = createHarness({ schemaVersion: 2 } as unknown as NetworkRuleState);
    applier.apply.mockRejectedValueOnce(new Error("temporary DNR failure"));

    await expect(handlers.get("getState")!()).rejects.toMatchObject({ code: "unsupported_schema" });
    dao.state = undefined;
    const retried = (await handlers.get("retryApply")!()) as { outcome: string; state: NetworkRuleState };

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
    const secondService = new NetworkRuleService(
      secondGroup,
      secondQueue,
      first.dao,
      compileNetworkRules,
      first.applier
    );
    secondService.init();

    const results = await Promise.allSettled([
      first.handlers.get("createRule")!({
        ...cspRule,
        baseRevision: 0,
        condition: { requestDomains: ["first.example"] },
      }),
      secondHandlers.get("createRule")!({
        ...cspRule,
        baseRevision: 0,
        condition: { requestDomains: ["second.example"] },
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
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
    await handlers.get("getState")!();
    const firstMutation = handlers.get("createRule")!({
      ...cspRule,
      baseRevision: 0,
      condition: { requestDomains: ["one.example"] },
    });
    const secondMutation = handlers.get("createRule")!({
      ...cspRule,
      baseRevision: 0,
      condition: { requestDomains: ["two.example"] },
    });
    await expect(firstMutation).resolves.toMatchObject({ outcome: "applied" });
    await expect(secondMutation).rejects.toMatchObject({ code: "revision_conflict" });
    expect(order).toEqual(["apply-start", "apply-end", "apply-start", "apply-end"]);
  });

  it("写后重新读取不一致时返回 storage error 且不调用 DNR", async () => {
    const { handlers, dao, applier } = createHarness();
    const initial = (await handlers.get("getState")!()) as { state: NetworkRuleState };
    vi.mocked(dao.saveState).mockResolvedValueOnce({ ...initial.state, revision: 99 });

    await expect(handlers.get("createRule")!({ ...cspRule, baseRevision: 0 })).rejects.toMatchObject({
      code: "storage_write_failed",
    });
    expect(applier.apply).toHaveBeenCalledOnce();
  });
});
