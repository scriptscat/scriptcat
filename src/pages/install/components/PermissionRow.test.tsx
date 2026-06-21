import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { PermissionRow } from "./PermissionRow";

beforeAll(() => initTestLanguage("zh-CN"));

afterEach(cleanup);

describe("PermissionRow 权限行", () => {
  it("渲染跨域访问类别标签、摘要与全部取值 chip", () => {
    render(
      <PermissionRow row={{ kind: "connect", risk: "warn", values: ["api.a.com", "api.b.com"], sensitive: [] }} />
    );
    expect(screen.getByText("跨域访问")).toBeInTheDocument();
    expect(screen.getByText("可向以下域名发送请求、读取其数据")).toBeInTheDocument();
    expect(screen.getByText("api.a.com")).toBeInTheDocument();
    expect(screen.getByText("api.b.com")).toBeInTheDocument();
  });

  it("danger 风险在行根节点标记 data-risk=danger", () => {
    render(<PermissionRow row={{ kind: "connect", risk: "danger", values: ["*"], sensitive: [] }} />);
    expect(screen.getByTestId("permission-row")).toHaveAttribute("data-risk", "danger");
  });

  it("warn 风险在行根节点标记 data-risk=warn", () => {
    render(<PermissionRow row={{ kind: "grant", risk: "warn", values: ["GM_setValue"], sensitive: [] }} />);
    expect(screen.getByTestId("permission-row")).toHaveAttribute("data-risk", "warn");
  });

  it("敏感取值额外标记 data-sensitive", () => {
    render(
      <PermissionRow
        row={{ kind: "grant", risk: "warn", values: ["GM_setValue", "GM_cookie"], sensitive: ["GM_cookie"] }}
      />
    );
    const cookie = screen.getByText("GM_cookie");
    const chip = cookie.closest("[data-chip]")!;
    expect(chip).toHaveAttribute("data-sensitive", "true");
    const setValue = screen.getByText("GM_setValue").closest("[data-chip]")!;
    expect(setValue).not.toHaveAttribute("data-sensitive", "true");
  });

  it("取值超过 maxVisible 时折叠为 +N", () => {
    render(
      <PermissionRow
        row={{ kind: "match", risk: "normal", values: ["a", "b", "c", "d", "e"], sensitive: [] }}
        maxVisible={3}
      />
    );
    const row = screen.getByTestId("permission-row");
    expect(within(row).getByText("a")).toBeInTheDocument();
    expect(within(row).getByText("c")).toBeInTheDocument();
    expect(within(row).queryByText("d")).not.toBeInTheDocument();
    expect(within(row).getByTestId("permission-more")).toHaveTextContent("+2");
  });

  it("点击 +N 展开余下取值并隐藏折叠按钮", () => {
    render(
      <PermissionRow
        row={{ kind: "match", risk: "normal", values: ["a", "b", "c", "d", "e"], sensitive: [] }}
        maxVisible={3}
      />
    );
    const row = screen.getByTestId("permission-row");
    fireEvent.click(within(row).getByTestId("permission-more"));
    expect(within(row).getByText("d")).toBeInTheDocument();
    expect(within(row).getByText("e")).toBeInTheDocument();
    expect(within(row).queryByTestId("permission-more")).not.toBeInTheDocument();
  });
});
