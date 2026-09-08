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

describe("PermissionRow 更新差异态", () => {
  const changed = {
    kind: "connect" as const,
    risk: "danger" as const,
    values: ["*", "api.a.com", "api.b.com"],
    sensitive: [],
    diff: { added: ["*"], removed: ["old.a.com"] },
  };

  it("新增与移除的取值常驻可见,未变动的收进折叠桶", () => {
    render(<PermissionRow row={changed} />);
    const row = screen.getByTestId("permission-row");
    expect(within(row).getByText("*")).toBeInTheDocument();
    expect(within(row).getByText("old.a.com")).toBeInTheDocument();
    expect(within(row).queryByText("api.a.com")).not.toBeInTheDocument();
    expect(within(row).getByTestId("permission-more")).toHaveTextContent("未变动 2 项");
  });

  it("变动状态标在 chip 上,且新增/移除带可读状态文案而不只靠颜色", () => {
    render(<PermissionRow row={changed} />);
    const row = screen.getByTestId("permission-row");
    expect(within(row).getByText("*").closest("[data-chip]")).toHaveAttribute("data-change", "added");
    expect(within(row).getByText("old.a.com").closest("[data-chip]")).toHaveAttribute("data-change", "removed");
    expect(within(row).getByText("新增")).toBeInTheDocument();
    expect(within(row).getByText("已移除")).toBeInTheDocument();
  });

  it("展开折叠桶后未变动取值可见并标记为 unchanged", () => {
    render(<PermissionRow row={changed} />);
    const row = screen.getByTestId("permission-row");
    fireEvent.click(within(row).getByTestId("permission-more"));
    expect(within(row).getByText("api.a.com").closest("[data-chip]")).toHaveAttribute("data-change", "unchanged");
    expect(within(row).queryByTestId("permission-more")).not.toBeInTheDocument();
  });

  it("行内变动计数按新增与移除分别呈现", () => {
    render(<PermissionRow row={changed} />);
    const row = screen.getByTestId("permission-row");
    expect(within(row).getByTestId("permission-delta")).toHaveTextContent("+1");
    expect(within(row).getByTestId("permission-delta")).toHaveTextContent("−1");
  });

  it("差异为空的行不渲染变动计数,取值全部按未变动呈现", () => {
    render(
      <PermissionRow
        row={{ kind: "match", risk: "normal", values: ["a"], sensitive: [], diff: { added: [], removed: [] } }}
      />
    );
    const row = screen.getByTestId("permission-row");
    expect(within(row).queryByTestId("permission-delta")).not.toBeInTheDocument();
    expect(within(row).getByText("a").closest("[data-chip]")).toHaveAttribute("data-change", "unchanged");
  });
});

describe("PermissionRow 零变动行的取值折叠", () => {
  const manyUnchanged = {
    kind: "match" as const,
    risk: "normal" as const,
    values: ["https://a.com/*", "https://b.com/*", "https://c.com/*", "https://d.com/*"],
    sensitive: [],
    diff: { added: [], removed: [] },
  };

  it("没有可钉住的增删时,取值仍按 maxVisible 折叠为 +N", () => {
    render(<PermissionRow row={manyUnchanged} maxVisible={2} />);
    const row = screen.getByTestId("permission-row");
    expect(within(row).getByText("https://a.com/*")).toBeInTheDocument();
    expect(within(row).queryByText("https://c.com/*")).not.toBeInTheDocument();
    expect(within(row).getByTestId("permission-more")).toHaveTextContent("+2");
  });

  it("点开 +N 后其余取值可见", () => {
    render(<PermissionRow row={manyUnchanged} maxVisible={2} />);
    const row = screen.getByTestId("permission-row");
    fireEvent.click(within(row).getByTestId("permission-more"));
    expect(within(row).getByText("https://d.com/*")).toBeInTheDocument();
    expect(within(row).queryByTestId("permission-more")).not.toBeInTheDocument();
  });
});
