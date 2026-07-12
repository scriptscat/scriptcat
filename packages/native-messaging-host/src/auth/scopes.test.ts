import { describe, it, expect } from "vitest";
import { hasScope, hasAnyWriteScope, visibleActions } from "./scopes";
import { ACTION_REQUIRED_SCOPE } from "../shared/protocol";

describe("hasScope / hasAnyWriteScope", () => {
  it("hasScope 在 scopes 数组包含目标 scope 时返回 true", () => {
    expect(hasScope(["scripts:list"], "scripts:list")).toBe(true);
    expect(hasScope(["scripts:list"], "scripts:source:read")).toBe(false);
  });

  it("hasAnyWriteScope 至少持有一个写 scope 时返回 true", () => {
    expect(hasAnyWriteScope(["scripts:list"])).toBe(false);
    expect(hasAnyWriteScope(["scripts:toggle:request"])).toBe(true);
    expect(hasAnyWriteScope(["scripts:list", "scripts:delete:request"])).toBe(true);
  });
});

describe("visibleActions - tools/list 按 scope 过滤（doc 03 §5）", () => {
  it("只读客户端看不到任何 request_* 工具", () => {
    const actions = visibleActions(["scripts:list", "scripts:metadata:read"], ACTION_REQUIRED_SCOPE);
    expect(actions).toContain("scripts.list");
    expect(actions).toContain("scripts.metadata.get");
    expect(actions).not.toContain("scripts.install.prepare");
    expect(actions).not.toContain("scripts.toggle.request");
    expect(actions).not.toContain("scripts.delete.request");
  });

  it("持有任一写 scope 的客户端可见 operations.* 管理动作", () => {
    const actions = visibleActions(["scripts:toggle:request"], ACTION_REQUIRED_SCOPE);
    expect(actions).toContain("operations.get");
    expect(actions).toContain("operations.list");
    expect(actions).toContain("operations.cancel");
    expect(actions).toContain("scripts.toggle.request");
    expect(actions).not.toContain("scripts.install.prepare");
  });

  it("没有任何写 scope 的客户端看不到 operations.*", () => {
    const actions = visibleActions(["scripts:list"], ACTION_REQUIRED_SCOPE);
    expect(actions).not.toContain("operations.get");
    expect(actions).not.toContain("operations.list");
    expect(actions).not.toContain("operations.cancel");
  });

  it("空 scopes 时只看到空目录", () => {
    expect(visibleActions([], ACTION_REQUIRED_SCOPE)).toEqual([]);
  });
});
