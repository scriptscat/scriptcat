import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import type { CspRuleClient } from "@App/app/service/service_worker/client";
import type { CspRuleSnapshot } from "@App/app/service/service_worker/csp_rule";
import { CspRulesSection } from "./CspRulesSection";

beforeAll(() => initTestLanguage("en-US"));
afterEach(cleanup);

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
    } as unknown as CspRuleClient;
    render(<CspRulesSection register={() => () => {}} client={client} />);
    expect(await screen.findByText("This CSP rules data format is not supported yet.")).toBeInTheDocument();
    getState.mockResolvedValue(snapshot());
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
});
