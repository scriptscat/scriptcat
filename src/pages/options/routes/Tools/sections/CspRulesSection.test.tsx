import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { CspRuleAmbiguousResponseError, type CspRuleClient } from "@App/app/service/service_worker/client";
import type { CspRuleSnapshot } from "@App/app/service/service_worker/csp_rule";
import { extensionEnv } from "@App/app/service/extension/extension_env";
import { CspRulesSection } from "./CspRulesSection";

beforeAll(() => initTestLanguage("en-US"));
afterEach(() => {
  extensionEnv.inIncognitoContext = false;
  cleanup();
});

function snapshot(rules: CspRuleSnapshot["state"]["rules"] = [], masterEnabled = true): CspRuleSnapshot {
  return {
    state: { schemaVersion: 1, revision: 0, masterEnabled, rules },
    apply: { state: "applied", revision: 0, appliedAt: 1 },
  };
}

function clientFor(current: CspRuleSnapshot) {
  return {
    getState: vi.fn().mockResolvedValue(current),
    createRule: vi.fn(),
    updateRule: vi.fn(),
    deleteRule: vi.fn(),
    setRuleEnabled: vi.fn(),
    setMasterEnabled: vi.fn(),
    retryApply: vi.fn(),
  } as unknown as CspRuleClient;
}

describe("CSP 规则工具卡", () => {
  it("隐私窗口提示只能在普通窗口管理且不读取 CSP 状态", async () => {
    extensionEnv.inIncognitoContext = true;
    const client = clientFor(snapshot());
    render(<CspRulesSection register={() => () => {}} client={client} />);

    expect(
      await screen.findByText(
        "Manage CSP rules from a normal window. CSP rules are not available in incognito windows."
      )
    ).toBeInTheDocument();
    expect(client.getState).not.toHaveBeenCalled();
  });

  it("空状态显示新增入口并能打开表单", async () => {
    const client = clientFor(snapshot());
    render(<CspRulesSection register={() => () => {}} client={client} />);
    expect(await screen.findByText("No CSP rules")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    expect(await screen.findByRole("heading", { name: "Add CSP rule" })).toBeInTheDocument();
  });

  it("第 21 条规则起按每批 20 条显示", async () => {
    const rules = Array.from({ length: 21 }, (_, index) => ({
      id: `rule-${index}`,
      name: `Rule ${index}`,
      enabled: true,
      target: { type: "domains" as const, domains: [`${index}.example.com`] },
      action: { type: "removeCspHeaders" as const },
      createdAt: 1,
      updatedAt: 1,
    }));
    const client = clientFor(snapshot(rules));
    render(<CspRulesSection register={() => () => {}} client={client} />);
    expect(await screen.findByText("Rule 0")).toBeInTheDocument();
    expect(screen.queryByText("Rule 20")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(screen.getByText("Rule 20")).toBeInTheDocument();
  });

  it("达到 100 条规则时禁用新增入口", async () => {
    const rules = Array.from({ length: 100 }, (_, index) => ({
      id: `rule-${index}`,
      name: `Rule ${index}`,
      enabled: true,
      target: { type: "domains" as const, domains: [`${index}.example.com`] },
      action: { type: "removeCspHeaders" as const },
      createdAt: 1,
      updatedAt: 1,
    }));
    const client = clientFor(snapshot(rules));
    render(<CspRulesSection register={() => () => {}} client={client} />);

    expect(await screen.findByRole("button", { name: "Add rule" })).toBeDisabled();
  });

  it("总开关暂停时仍显示逐条启用状态", async () => {
    const client = clientFor(
      snapshot(
        [
          {
            id: "rule-1",
            name: "Example",
            enabled: true,
            target: { type: "domains", domains: ["example.com"] },
            action: { type: "removeCspHeaders" },
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        false
      )
    );
    render(<CspRulesSection register={() => () => {}} client={client} />);
    expect(await screen.findByText(/Paused/)).toBeInTheDocument();
    expect(screen.getByText("Enabled")).toBeInTheDocument();
  });

  it("加载失败时显示可重试错误并在重试成功后恢复空状态", async () => {
    const getState = vi.fn().mockRejectedValue(JSON.stringify({ code: "unsupported_schema" }));
    const client = {
      ...clientFor(snapshot()),
      getState,
      retryApply: vi.fn().mockResolvedValue({
        ...snapshot(),
        outcome: "applied" as const,
      }),
    } as unknown as CspRuleClient;
    render(<CspRulesSection register={() => () => {}} client={client} />);
    expect(await screen.findByText("This CSP rules data format is not supported yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No CSP rules")).toBeInTheDocument();
  });

  it("启用所有网站规则前要求确认，取消不会修改状态", async () => {
    const client = clientFor(
      snapshot([
        {
          id: "all-sites",
          name: "All websites",
          enabled: false,
          target: { type: "allSites" },
          action: { type: "removeCspHeaders" },
          createdAt: 1,
          updatedAt: 1,
        },
      ])
    );
    render(<CspRulesSection register={() => () => {}} client={client} />);
    fireEvent.click(await screen.findByRole("switch", { name: "All websites Enabled" }));
    expect(await screen.findByRole("heading", { name: "Affect all websites?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(client.setRuleEnabled).not.toHaveBeenCalled();
  });

  it("恢复包含所有网站规则的总开关前要求确认，取消不会修改状态", async () => {
    const client = clientFor(
      snapshot(
        [
          {
            id: "all-sites",
            name: "All websites",
            enabled: true,
            target: { type: "allSites" },
            action: { type: "removeCspHeaders" },
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        false
      )
    );
    render(<CspRulesSection register={() => () => {}} client={client} />);
    fireEvent.click(await screen.findByRole("switch", { name: "Run CSP rules" }));
    expect(await screen.findByRole("heading", { name: "Affect all websites?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(client.setMasterEnabled).not.toHaveBeenCalled();
  });

  it("保存响应在传输中丢失但服务端已生效时，重新拉取 state 后视为保存成功", async () => {
    const before = snapshot();
    const after = snapshot([
      {
        id: "rule-1",
        name: "example.com",
        enabled: true,
        target: { type: "domains", domains: ["example.com"] },
        action: { type: "removeCspHeaders" },
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    after.state.revision = 1;
    const client = clientFor(before);
    client.createRule = vi.fn().mockRejectedValue(new CspRuleAmbiguousResponseError());
    client.getState = vi.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(after);
    render(<CspRulesSection register={() => () => {}} client={client} />);

    fireEvent.click(await screen.findByRole("button", { name: "Add rule" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "Websites" }), {
      target: { value: "example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));

    expect(await screen.findAllByText("example.com")).not.toHaveLength(0);
    expect(screen.queryByText("The rule could not be saved. Your form entries were kept.")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Add CSP rule" })).not.toBeInTheDocument();
  });

  it("保存响应丢失且服务端实际未生效时，仍提示保存失败", async () => {
    const before = snapshot();
    const client = clientFor(before);
    client.createRule = vi.fn().mockRejectedValue(new CspRuleAmbiguousResponseError());
    client.getState = vi.fn().mockResolvedValue(before);
    render(<CspRulesSection register={() => () => {}} client={client} />);

    fireEvent.click(await screen.findByRole("button", { name: "Add rule" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "Websites" }), {
      target: { value: "example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));

    expect(await screen.findByText("The rule could not be saved. Your form entries were kept.")).toBeInTheDocument();
  });

  it("删除确认弹窗使用独立的 AlertDialog，而不是嵌套在下拉菜单内的气泡", async () => {
    const client = clientFor(
      snapshot([
        {
          id: "rule-1",
          name: "example.com",
          enabled: true,
          target: { type: "domains", domains: ["example.com"] },
          action: { type: "removeCspHeaders" },
          createdAt: 1,
          updatedAt: 1,
        },
      ])
    );
    render(<CspRulesSection register={() => () => {}} client={client} />);

    const trigger = await screen.findByRole("button", { name: "More actions" });
    fireEvent.pointerDown(trigger, { button: 0 });
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));

    expect(await screen.findByText("Delete this CSP rule?")).toBeInTheDocument();
    // 下拉菜单已关闭：菜单内的 Edit 项不应再出现在文档中。
    expect(screen.queryByRole("menuitem", { name: "Edit" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(client.deleteRule).toHaveBeenCalledWith({ baseRevision: 0, id: "rule-1" });
  });
});
