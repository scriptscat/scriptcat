import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";

let mobile = false;
vi.mock("@App/pages/components/use-is-mobile", () => ({
  useIsMobile: () => mobile,
  MOBILE_BREAKPOINT: 768,
}));

import { PermissionCard } from "./PermissionCard";
import type { PermissionRow } from "../permissions";

const match: PermissionRow = { kind: "match", risk: "normal", values: ["https://a.com/*"], sensitive: [] };
const connect: PermissionRow = { kind: "connect", risk: "danger", values: ["*"], sensitive: [] };

beforeAll(() => initTestLanguage("zh-CN"));

afterEach(() => {
  cleanup();
  mobile = false;
});

describe("PermissionCard 权限卡", () => {
  it("渲染卡头标题与提示,并为每个权限行输出一行", () => {
    render(<PermissionCard rows={[match, connect]} />);
    expect(screen.getByText("此脚本将获得以下权限")).toBeInTheDocument();
    expect(screen.getByText("安装前请确认")).toBeInTheDocument();
    expect(screen.getAllByTestId("permission-row")).toHaveLength(2);
  });

  it("无权限行时显示空态文案且不渲染权限行", () => {
    render(<PermissionCard rows={[]} />);
    expect(screen.getByText("此脚本不请求任何特殊权限")).toBeInTheDocument();
    expect(screen.queryAllByTestId("permission-row")).toHaveLength(0);
  });

  it("移动端改用 Accordion,默认仅展开高风险项", () => {
    mobile = true;
    render(<PermissionCard rows={[match, connect]} />);
    // 两个分类的折叠触发器都在
    expect(screen.getByText("运行网站")).toBeInTheDocument();
    expect(screen.getByText("跨域访问")).toBeInTheDocument();
    // danger(跨域访问)默认展开,其取值可见
    expect(screen.getByText("*")).toBeInTheDocument();
    // normal(运行网站)默认折叠,其取值不在 DOM
    expect(screen.queryByText("https://a.com/*")).not.toBeInTheDocument();
  });
});

describe("PermissionCard 更新差异态", () => {
  const changedConnect: PermissionRow = {
    kind: "connect",
    risk: "danger",
    values: ["*", "api.a.com"],
    sensitive: [],
    diff: { added: ["*"], removed: ["old.a.com"] },
  };
  const sameMatch: PermissionRow = {
    kind: "match",
    risk: "normal",
    values: ["https://a.com/*"],
    sensitive: [],
    diff: { added: [], removed: [] },
  };

  it("有变动时卡头显示变化标题、全卡增删计数与对比版本", () => {
    render(<PermissionCard rows={[changedConnect, sameMatch]} baselineVersion="1.2.3" />);
    expect(screen.getByText("权限变化")).toBeInTheDocument();
    expect(screen.getByTestId("permission-card-delta")).toHaveTextContent("+1");
    expect(screen.getByTestId("permission-card-delta")).toHaveTextContent("−1");
    expect(screen.getByText("对比已安装的 1.2.3")).toBeInTheDocument();
  });

  it("有变动的类别展开,无变动的类别塌成单行", () => {
    render(<PermissionCard rows={[changedConnect, sameMatch]} baselineVersion="1.2.3" />);
    expect(screen.getAllByTestId("permission-row")).toHaveLength(1);
    const collapsed = screen.getByTestId("permission-row-collapsed");
    expect(within(collapsed).getByText("运行网站")).toBeInTheDocument();
    expect(within(collapsed).getByText("无变化")).toBeInTheDocument();
    expect(screen.queryByText("https://a.com/*")).not.toBeInTheDocument();
  });

  it("点开塌行后该类别取值可见", () => {
    render(<PermissionCard rows={[changedConnect, sameMatch]} baselineVersion="1.2.3" />);
    fireEvent.click(screen.getByTestId("permission-row-collapsed"));
    expect(screen.getByText("https://a.com/*")).toBeInTheDocument();
    expect(screen.getAllByTestId("permission-row")).toHaveLength(2);
  });

  it("塌行把自己声明为收起的展开控件", () => {
    render(<PermissionCard rows={[changedConnect, sameMatch]} baselineVersion="1.2.3" />);
    expect(screen.getByTestId("permission-row-collapsed")).toHaveAttribute("aria-expanded", "false");
  });

  it("没有任何权限的更新沿用空态卡头与文案,不进入差异呈现", () => {
    render(<PermissionCard rows={[]} baselineVersion="1.2.3" />);
    expect(screen.getByText("此脚本不请求任何特殊权限")).toBeInTheDocument();
    expect(screen.getByText("安装前请确认")).toBeInTheDocument();
    expect(screen.queryByText("无变化")).not.toBeInTheDocument();
    expect(screen.queryByText("对比已安装的 1.2.3")).not.toBeInTheDocument();
  });

  it("更新但一项未变时不显示变化标题与增删计数", () => {
    render(<PermissionCard rows={[sameMatch]} baselineVersion="1.2.3" />);
    expect(screen.queryByText("权限变化")).not.toBeInTheDocument();
    expect(screen.queryByTestId("permission-card-delta")).not.toBeInTheDocument();
  });

  it("移动端默认展开有变动的类别,未变动的收起", () => {
    mobile = true;
    render(<PermissionCard rows={[changedConnect, sameMatch]} baselineVersion="1.2.3" />);
    expect(screen.getByText("*")).toBeInTheDocument();
    expect(screen.queryByText("https://a.com/*")).not.toBeInTheDocument();
  });

  it("全新安装(无 diff)卡头维持原样", () => {
    render(<PermissionCard rows={[match, connect]} />);
    expect(screen.getByText("此脚本将获得以下权限")).toBeInTheDocument();
    expect(screen.queryByTestId("permission-card-delta")).not.toBeInTheDocument();
    expect(screen.queryByTestId("permission-row-collapsed")).not.toBeInTheDocument();
  });
});

describe("PermissionCard 更新零变化态", () => {
  const same = (kind: PermissionRow["kind"], values: string[]): PermissionRow => ({
    kind,
    risk: "normal",
    values,
    sensitive: [],
    diff: { added: [], removed: [] },
  });
  const rows = [same("connect", ["api.a.com"]), same("match", ["https://a.com/*", "https://b.com/*"])];

  it("零变化时整卡折叠为单行,四类取值都不在 DOM", () => {
    render(<PermissionCard rows={rows} baselineVersion="1.2.3" />);
    expect(screen.getByTestId("permission-card-collapsed")).toBeInTheDocument();
    expect(screen.queryByText("api.a.com")).not.toBeInTheDocument();
    expect(screen.queryByText("https://a.com/*")).not.toBeInTheDocument();
    expect(screen.queryAllByTestId("permission-row")).toHaveLength(0);
  });

  it("折叠单行给出基线版本与类别数、取值总数", () => {
    render(<PermissionCard rows={rows} baselineVersion="1.2.3" />);
    const line = screen.getByTestId("permission-card-collapsed");
    expect(within(line).getByText("与 1.2.3 相同")).toBeInTheDocument();
    expect(within(line).getByText("2 类 3 项")).toBeInTheDocument();
    expect(within(line).getByText("无变化")).toBeInTheDocument();
  });

  it("点开后四类全量呈现,每类标无变化", () => {
    render(<PermissionCard rows={rows} baselineVersion="1.2.3" />);
    fireEvent.click(screen.getByTestId("permission-card-collapsed"));
    expect(screen.getAllByTestId("permission-row")).toHaveLength(2);
    expect(screen.getByText("api.a.com")).toBeInTheDocument();
    expect(screen.getByText("https://a.com/*")).toBeInTheDocument();
    expect(screen.getAllByText("无变化")).toHaveLength(3);
  });

  it("折叠单行对辅助技术同样报出无变化与摘要,并声明自己是收起的展开控件", () => {
    render(<PermissionCard rows={rows} baselineVersion="1.2.3" />);
    const line = screen.getByTestId("permission-card-collapsed");
    expect(line).toHaveAccessibleName(expect.stringContaining("无变化"));
    expect(line).toHaveAccessibleName(expect.stringContaining("2 类 3 项"));
    expect(line).toHaveAttribute("aria-expanded", "false");
  });

  it("移动端点开零变化整卡后按高风险默认展开,与全新安装一致", () => {
    mobile = true;
    const sameDangerConnect: PermissionRow = { ...same("connect", ["*"]), risk: "danger" };
    render(<PermissionCard rows={[sameDangerConnect, same("match", ["https://a.com/*"])]} baselineVersion="1.2.3" />);
    fireEvent.click(screen.getByTestId("permission-card-collapsed"));
    expect(screen.getByText("*")).toBeInTheDocument();
    expect(screen.queryByText("https://a.com/*")).not.toBeInTheDocument();
  });

  it("有变动时不折叠整卡", () => {
    const changedRow: PermissionRow = {
      kind: "connect",
      risk: "warn",
      values: ["api.a.com"],
      sensitive: [],
      diff: { added: ["api.a.com"], removed: [] },
    };
    render(<PermissionCard rows={[changedRow]} baselineVersion="1.2.3" />);
    expect(screen.queryByTestId("permission-card-collapsed")).not.toBeInTheDocument();
  });

  it("全新安装不折叠整卡", () => {
    render(<PermissionCard rows={[match, connect]} />);
    expect(screen.queryByTestId("permission-card-collapsed")).not.toBeInTheDocument();
  });

  it("移动端零变化同样折叠为单行", () => {
    mobile = true;
    render(<PermissionCard rows={rows} baselineVersion="1.2.3" />);
    expect(screen.getByTestId("permission-card-collapsed")).toBeInTheDocument();
    expect(screen.queryByText("api.a.com")).not.toBeInTheDocument();
  });
});
