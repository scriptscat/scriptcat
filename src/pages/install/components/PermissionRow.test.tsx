import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import type { IneffectiveTag } from "../compat";
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
    diff: { added: ["*"], removed: ["old.a.com"], updated: [] },
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
        row={{
          kind: "match",
          risk: "normal",
          values: ["a"],
          sensitive: [],
          diff: { added: [], removed: [], updated: [] },
        }}
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
    diff: { added: [], removed: [], updated: [] },
  };

  it("没有可钉住的增删时,取值仍按 maxVisible 折叠为 +N", () => {
    render(<PermissionRow row={manyUnchanged} maxVisible={2} />);
    const row = screen.getByTestId("permission-row");
    expect(within(row).getByTitle("https://a.com/*")).toBeInTheDocument();
    expect(within(row).queryByTitle("https://c.com/*")).not.toBeInTheDocument();
    expect(within(row).getByTestId("permission-more")).toHaveTextContent("+2");
  });

  it("点开 +N 后其余取值可见", () => {
    render(<PermissionRow row={manyUnchanged} maxVisible={2} />);
    const row = screen.getByTestId("permission-row");
    fireEvent.click(within(row).getByTestId("permission-more"));
    expect(within(row).getByTitle("https://d.com/*")).toBeInTheDocument();
    expect(within(row).queryByTestId("permission-more")).not.toBeInTheDocument();
  });
});

describe("PermissionRow 上的不生效标记", () => {
  const compat = (
    over: Partial<{
      grants: Map<string, number | undefined>;
      matches: Map<string, number | undefined>;
      tags: IneffectiveTag[];
    }> = {}
  ) => ({
    marks: { grants: new Map(), tags: [], matches: new Map(), scriptcatOnlyTags: [], ...over },
  });

  it("不受支持的 GM 能力就地换成不生效标记，其余 chip 不变", () => {
    render(
      <PermissionRow
        row={{ kind: "grant", risk: "warn", values: ["GM_setValue", "GM_audio"], sensitive: [] }}
        compat={compat({ grants: new Map([["GM_audio", 9]]) })}
      />
    );
    const marks = screen.getAllByTestId("compat-chip");
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent("GM_audio");
    expect(screen.getByText("GM_setValue")).toBeInTheDocument();
    expect(screen.getByText("GM_setValue").closest('[data-testid="compat-chip"]')).toBeNull();
  });

  it("不生效的指令不在权限行上呈现——它们统一归「其他声明」行", () => {
    render(
      <PermissionRow
        row={{ kind: "connect", risk: "warn", values: ["api.a.com"], sensitive: [] }}
        compat={compat({ tags: [{ tag: "sandbox", line: 3 }] })}
      />
    );
    expect(screen.queryByTestId("compat-chip")).not.toBeInTheDocument();
  });

  it("解析不出规则的 @match 取值就地换成不生效标记，并链到文档的 match 小节", () => {
    render(
      <PermissionRow
        row={{ kind: "match", risk: "normal", values: ["*://a.com/*", "hello-world^^"], sensitive: [] }}
        compat={compat({ matches: new Map([["hello-world^^", 4]]) })}
      />
    );
    const marks = screen.getAllByTestId("compat-chip");
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent("hello-world^^");
    expect(screen.getAllByText("hello-world^^")).toHaveLength(1);
    fireEvent.mouseEnter(marks[0]);
    expect(screen.getByTestId("compat-docs")).toHaveAttribute(
      "href",
      expect.stringMatching(/\/docs\/dev\/meta#match$/)
    );
  });

  it("更新态里被移除的能力不标记——它已经不在新版本里了", () => {
    render(
      <PermissionRow
        row={{
          kind: "grant",
          risk: "warn",
          values: ["GM_setValue"],
          sensitive: [],
          diff: { added: [], removed: ["GM_audio"], updated: [] },
        }}
        compat={compat({ grants: new Map([["GM_audio", 9]]) })}
      />
    );
    expect(screen.queryByTestId("compat-chip")).not.toBeInTheDocument();
  });
});

describe("PermissionRow 上的仅限脚本猫标记", () => {
  it("CAT_ 与 CAT. 能力标出仅限脚本猫，通用 GM 能力不标", () => {
    render(
      <PermissionRow
        row={{
          kind: "grant",
          risk: "warn",
          values: ["GM_setValue", "CAT_fileStorage", "CAT.agent.dom"],
          sensitive: [],
        }}
      />
    );
    const row = screen.getByTestId("permission-row");
    expect(within(row).getAllByTestId("scriptcat-only")).toHaveLength(2);
    expect(
      within(screen.getByText("CAT_fileStorage").closest("[data-chip]")!).getByText("仅限脚本猫")
    ).toBeInTheDocument();
    expect(within(screen.getByText("GM_setValue").closest("[data-chip]")!).queryByTestId("scriptcat-only")).toBeNull();
  });

  it("更新态里被移除的 CAT 能力不标——它已经不在新版本里了", () => {
    render(
      <PermissionRow
        row={{
          kind: "grant",
          risk: "warn",
          values: ["GM_setValue"],
          sensitive: [],
          diff: { added: [], removed: ["CAT_fileStorage"], updated: [] },
        }}
      />
    );
    expect(screen.queryByTestId("scriptcat-only")).not.toBeInTheDocument();
  });
});

describe("仅限脚本猫标签的文档链接", () => {
  it("文档里有对应小节的 CAT 能力，标签链到该小节", () => {
    render(<PermissionRow row={{ kind: "grant", risk: "warn", values: ["CAT_fileStorage"], sensitive: [] }} />);
    expect(screen.getByTestId("scriptcat-only")).toHaveAttribute(
      "href",
      expect.stringMatching(/\/docs\/dev\/cat-api#cat_filestorage$/)
    );
  });

  it("文档里没有说明的 CAT 能力只标不链——点过去找不到比不给链接更糟", () => {
    render(<PermissionRow row={{ kind: "grant", risk: "warn", values: ["CAT_createBlobUrl"], sensitive: [] }} />);
    expect(screen.getByTestId("scriptcat-only")).not.toHaveAttribute("href");
  });
});

describe("不生效标记不会被折叠藏起来", () => {
  const marks = (grants: [string, number][]) => ({
    marks: { grants: new Map(grants), matches: new Map(), tags: [], scriptcatOnlyTags: [] },
  });

  it("取值超过 maxVisible 时，排在后面的不生效能力仍然可见", () => {
    render(
      <PermissionRow
        row={{
          kind: "grant",
          risk: "warn",
          values: ["GM_setValue", "GM_getValue", "GM_log", "GM_audio"],
          sensitive: [],
        }}
        maxVisible={2}
        compat={marks([["GM_audio", 9]])}
      />
    );
    const row = screen.getByTestId("permission-row");
    expect(within(row).getByTestId("compat-chip")).toHaveTextContent("GM_audio");
    expect(within(row).queryByText("GM_log")).not.toBeInTheDocument();
    expect(within(row).getByTestId("permission-more")).toHaveTextContent("+1");
  });

  it("更新态里属于未变动的不生效能力不收进折叠桶", () => {
    render(
      <PermissionRow
        row={{
          kind: "grant",
          risk: "warn",
          values: ["GM_getValue", "GM_setValue", "GM_audio"],
          sensitive: [],
          diff: { added: ["GM_getValue"], removed: [], updated: [] },
        }}
        compat={marks([["GM_audio", 9]])}
      />
    );
    const row = screen.getByTestId("permission-row");
    expect(within(row).getByTestId("compat-chip")).toHaveTextContent("GM_audio");
    expect(within(row).queryByText("GM_setValue")).not.toBeInTheDocument();
    expect(within(row).getByTestId("permission-more")).toHaveTextContent("未变动 1 项");
  });

  it("零变动行超过 maxVisible 时，不生效能力同样可见", () => {
    render(
      <PermissionRow
        row={{
          kind: "grant",
          risk: "warn",
          values: ["GM_setValue", "GM_getValue", "GM_audio"],
          sensitive: [],
          diff: { added: [], removed: [], updated: [] },
        }}
        maxVisible={1}
        compat={marks([["GM_audio", 9]])}
      />
    );
    expect(screen.getByTestId("compat-chip")).toHaveTextContent("GM_audio");
    expect(screen.getByTestId("permission-more")).toHaveTextContent("+1");
  });
});

describe("PermissionRow 更新态的行头", () => {
  it("更新态只给变动数,不再给类别总数徽章;全新安装仍显示总数", () => {
    const { rerender } = render(
      <PermissionRow
        row={{
          kind: "grant",
          risk: "warn",
          values: ["GM_addStyle", "GM_setValue"],
          sensitive: [],
          diff: { added: ["GM_addStyle"], removed: [], updated: [] },
        }}
      />
    );
    expect(screen.queryByTestId("permission-count")).not.toBeInTheDocument();
    rerender(<PermissionRow row={{ kind: "grant", risk: "warn", values: ["GM_addStyle"], sensitive: [] }} />);
    expect(screen.getByTestId("permission-count")).toHaveTextContent("1");
  });
});

describe("PermissionRow 变动取值的配色", () => {
  it("普通新增用新增色记号,危险与敏感的新增沿用风险色,不被染成新增色", () => {
    render(
      <>
        <PermissionRow
          row={{
            kind: "connect",
            risk: "danger",
            values: ["*"],
            sensitive: [],
            diff: { added: ["*"], removed: [], updated: [] },
          }}
        />
        <PermissionRow
          row={{
            kind: "grant",
            risk: "warn",
            values: ["GM_cookie", "GM_addStyle"],
            sensitive: ["GM_cookie"],
            diff: { added: ["GM_cookie", "GM_addStyle"], removed: [], updated: [] },
          }}
        />
      </>
    );
    const glyph = (value: string) =>
      within(screen.getByText(value).closest("[data-chip]") as HTMLElement).getByText("+");
    expect(glyph("GM_addStyle")).toHaveClass("text-success-fg");
    expect(glyph("*")).not.toHaveClass("text-success-fg");
    expect(glyph("GM_cookie")).not.toHaveClass("text-success-fg");
  });

  it("移除、更新、行头计数与折叠按钮都不用风险色或强调色——红色只留给危险取值", () => {
    render(
      <PermissionRow
        row={{
          kind: "require",
          risk: "normal",
          values: ["https://a.com/new.js", "https://cdn.a.com/lib.js?v2", "https://b.com/keep.js"],
          sensitive: [],
          diff: {
            added: ["https://a.com/new.js"],
            removed: ["https://old.com/gone.js"],
            updated: [{ from: "https://cdn.a.com/lib.js?v1", to: "https://cdn.a.com/lib.js?v2" }],
          },
        }}
      />
    );
    const row = screen.getByTestId("permission-row");
    expect(screen.getByText("未变动 1 项")).toBeInTheDocument();
    expect(row.querySelectorAll('[class*="destructive"], [class*="primary"]')).toHaveLength(0);
  });
});

describe("PermissionRow 只换了查询参数的外部资源", () => {
  const row = {
    kind: "require" as const,
    risk: "normal" as const,
    values: ["https://cdn.a.com/x/lib.js?v1.3.0"],
    sensitive: [],
    diff: {
      added: [],
      removed: [],
      updated: [{ from: "https://cdn.a.com/x/lib.js?v1.2.0", to: "https://cdn.a.com/x/lib.js?v1.3.0" }],
    },
  };

  it("合并成一条更新,给出旧参数到新参数,并计入行头的更新数", () => {
    render(<PermissionRow row={row} />);
    const chip = screen.getByTitle("https://cdn.a.com/x/lib.js?v1.3.0").closest("[data-chip]") as HTMLElement;
    expect(chip).toHaveAttribute("data-change", "updated");
    expect(within(chip).getByText("?v1.2.0")).toBeInTheDocument();
    expect(within(chip).getByText("?v1.3.0")).toBeInTheDocument();
    expect(within(chip).getByText("已更新")).toBeInTheDocument();
    expect(screen.getByTestId("permission-delta")).toHaveTextContent("~1");
    expect(screen.queryByTestId("permission-more")).not.toBeInTheDocument();
  });
});

describe("PermissionRow 增删很多时的截断", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => `https://s${i + 1}.com/*`);

  it("新增超过 8 条时只显示前 8 条,其余收进「再显示 N 项新增」,点开后全部可见", () => {
    const added = many(10);
    render(
      <PermissionRow
        row={{ kind: "match", risk: "normal", values: added, sensitive: [], diff: { added, removed: [], updated: [] } }}
      />
    );
    expect(screen.getByTitle("https://s8.com/*")).toBeInTheDocument();
    expect(screen.queryByTitle("https://s9.com/*")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /再显示 2 项新增/ }));
    expect(screen.getByTitle("https://s10.com/*")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /项新增/ })).not.toBeInTheDocument();
  });

  it("危险与敏感的新增取值永远不被收起", () => {
    const added = ["GM_a", "GM_b", "GM_c", "GM_cookie"];
    render(
      <PermissionRow
        row={{
          kind: "grant",
          risk: "warn",
          values: added,
          sensitive: ["GM_cookie"],
          diff: { added, removed: [], updated: [] },
        }}
        maxVisible={2}
      />
    );
    expect(screen.getByText("GM_cookie")).toBeInTheDocument();
    expect(screen.queryByText("GM_c")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /再显示 1 项新增/ })).toBeInTheDocument();
  });

  it("移除超过 8 条时只显示前 8 条,其余收进「再显示 N 项已移除」", () => {
    const removed = many(9);
    render(
      <PermissionRow
        row={{ kind: "match", risk: "normal", values: [], sensitive: [], diff: { added: [], removed, updated: [] } }}
      />
    );
    expect(screen.queryByTitle("https://s9.com/*")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /再显示 1 项已移除/ }));
    expect(screen.getByTitle("https://s9.com/*")).toBeInTheDocument();
  });
});

describe("PermissionRow 地址类取值的展示", () => {
  const value = "https://greasyfork.org/scripts/435207/code/GitHub%20%E4%B8%AD%E6%96%87.js?v1.9.2";

  it("地址解码后单行展示,域名单独突出,悬停给出原文", () => {
    render(<PermissionRow row={{ kind: "require", risk: "normal", values: [value], sensitive: [] }} />);
    const toggle = screen.getByTitle(value);
    expect(within(toggle).getByText("greasyfork.org")).toBeInTheDocument();
    expect(within(toggle).getByText("/GitHub 中文.js?v1.9.2")).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("点击后展开为完整地址,再点收起", () => {
    render(<PermissionRow row={{ kind: "require", risk: "normal", values: [value], sensitive: [] }} />);
    fireEvent.click(screen.getByTitle(value));
    expect(screen.getByTitle(value)).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("https://greasyfork.org/scripts/435207/code/GitHub 中文.js?v1.9.2")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle(value));
    expect(screen.getByTitle(value)).toHaveAttribute("aria-expanded", "false");
  });

  it("跨域访问与 GM 能力的取值不是地址,保持原样", () => {
    render(<PermissionRow row={{ kind: "connect", risk: "warn", values: ["api.a.com"], sensitive: [] }} />);
    expect(screen.getByText("api.a.com")).toBeInTheDocument();
    expect(screen.queryByTitle("api.a.com")).not.toBeInTheDocument();
  });
});
