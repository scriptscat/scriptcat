// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { initLanguage } from "@App/locales/locales";

let mobile = false;
vi.mock("@App/pages/components/use-is-mobile", () => ({
  useIsMobile: () => mobile,
  MOBILE_BREAKPOINT: 768,
}));

import { PermissionCard } from "./PermissionCard";
import type { PermissionRow } from "../permissions";

const match: PermissionRow = { kind: "match", risk: "normal", values: ["https://a.com/*"], sensitive: [] };
const connect: PermissionRow = { kind: "connect", risk: "danger", values: ["*"], sensitive: [] };

afterEach(() => {
  cleanup();
  mobile = false;
});

describe("PermissionCard 权限卡", () => {
  it("渲染卡头标题与提示,并为每个权限行输出一行", () => {
    initLanguage("zh-CN");
    render(<PermissionCard rows={[match, connect]} />);
    expect(screen.getByText("此脚本将获得以下权限")).toBeInTheDocument();
    expect(screen.getByText("安装前请确认")).toBeInTheDocument();
    expect(screen.getAllByTestId("permission-row")).toHaveLength(2);
  });

  it("无权限行时显示空态文案且不渲染权限行", () => {
    initLanguage("zh-CN");
    render(<PermissionCard rows={[]} />);
    expect(screen.getByText("此脚本不请求任何特殊权限")).toBeInTheDocument();
    expect(screen.queryAllByTestId("permission-row")).toHaveLength(0);
  });

  it("移动端改用 Accordion,默认仅展开高风险项", () => {
    initLanguage("zh-CN");
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
