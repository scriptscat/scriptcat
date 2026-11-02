import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within, act } from "@testing-library/react";
import { mockMatchMedia } from "@Tests/mockMatchMedia";
import { mockIntersectionObserver } from "@Tests/mockIntersectionObserver";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { SkillInstallView } from "./SkillInstallView";

const toolCode = [
  "// ==SkillScript==",
  "// @name fetch_data",
  "// @description 抓取远程数据",
  "// @param url string [required] 目标地址",
  "// @grant GM_xmlhttpRequest",
  "// ==/SkillScript==",
  "console.log('body');",
].join("\n");

const baseProps = () => ({
  metadata: {
    name: "网页摘要技能",
    description: "对当前网页生成摘要",
    version: "1.2.0",
    config: {
      apiKey: { title: "API 密钥", type: "text" as const, required: true, secret: true },
    },
  },
  prompt: "你是一个网页摘要助手。".repeat(20),
  scripts: [{ name: "fetch_data.js", code: toolCode }],
  references: [{ name: "style-guide.md", content: "..." }],
  isUpdate: false,
  installUrl: "https://scriptcat.org/skills/summary.zip",
  onInstall: vi.fn(),
  onCancel: vi.fn(),
});

beforeAll(() => initTestLanguage("zh-CN"));

afterEach(cleanup);

describe("SkillInstallView 技能安装视图", () => {
  it("渲染技能名、Skill 徽章与描述", () => {
    render(<SkillInstallView {...baseProps()} />);
    expect(screen.getByText("网页摘要技能")).toBeInTheDocument();
    expect(screen.getByText("Skill")).toBeInTheDocument();
    expect(screen.getByText("对当前网页生成摘要")).toBeInTheDocument();
  });

  it("提示词默认折叠为预览,点击后展开完整内容", () => {
    render(<SkillInstallView {...baseProps()} />);
    expect(screen.queryByTestId("skill-prompt-full")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("skill-prompt-toggle"));
    expect(screen.getByTestId("skill-prompt-full")).toBeInTheDocument();
  });

  it("渲染工具名、参数与 grants 能力", () => {
    render(<SkillInstallView {...baseProps()} />);
    expect(screen.getByText("fetch_data")).toBeInTheDocument();
    expect(screen.getByText("url")).toBeInTheDocument();
    expect(screen.getByText("GM_xmlhttpRequest")).toBeInTheDocument();
    // 工具参数与配置项都可能标「必填」,此处确认至少渲染了必填标记
    expect(screen.getAllByText("必填").length).toBeGreaterThanOrEqual(1);
  });

  it("渲染配置项的 key 与 secret 标记", () => {
    render(<SkillInstallView {...baseProps()} />);
    expect(screen.getByText("apiKey")).toBeInTheDocument();
    expect(screen.getByText("私密")).toBeInTheDocument();
  });

  it("渲染参考资料文件名", () => {
    render(<SkillInstallView {...baseProps()} />);
    expect(screen.getByText("style-guide.md")).toBeInTheDocument();
  });

  it("更新态主按钮文案为更新 Skill", () => {
    render(<SkillInstallView {...baseProps()} isUpdate />);
    expect(screen.getByTestId("skill-install")).toHaveTextContent("更新 Skill");
  });

  it("点击安装与关闭触发回调", () => {
    const p = baseProps();
    render(<SkillInstallView {...p} />);
    fireEvent.click(screen.getByTestId("skill-install"));
    expect(p.onInstall).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("skill-cancel"));
    expect(p.onCancel).toHaveBeenCalledTimes(1);
  });

  it("渲染安全警示卡(对照设计稿 Alert Warning)", () => {
    render(<SkillInstallView {...baseProps()} />);
    expect(screen.getByTestId("skill-warning-card")).toBeInTheDocument();
  });
});

describe("SkillInstallView 操作位置", () => {
  let io: ReturnType<typeof mockIntersectionObserver>;
  beforeEach(() => {
    mockMatchMedia(false);
    io = mockIntersectionObserver();
  });

  it("桌面端关闭、安装与警示语位于技能身份卡内，首屏不渲染吸底栏", () => {
    render(<SkillInstallView {...baseProps()} />);
    const card = screen.getByTestId("skill-identity");
    expect(within(card).getByTestId("skill-install")).toBeInTheDocument();
    expect(within(card).getByTestId("skill-cancel")).toBeInTheDocument();
    expect(within(card).getByTestId("action-note")).toHaveTextContent("技能会向 AI 注入提示词");
    expect(screen.queryByTestId("action-bar")).not.toBeInTheDocument();
  });

  it("桌面端身份卡操作组滚出后，吸底栏给出技能名与可用的安装按钮", () => {
    const p = baseProps();
    render(<SkillInstallView {...p} />);
    act(() => {
      io.setIntersecting(screen.getByTestId("card-actions"), false);
    });
    const bar = screen.getByTestId("action-bar");
    expect(within(bar).getByText("网页摘要技能")).toBeInTheDocument();
    fireEvent.click(within(bar).getByTestId("skill-install"));
    expect(p.onInstall).toHaveBeenCalledTimes(1);
  });

  it("桌面端安装失败时失败条在技能身份卡内", () => {
    render(<SkillInstallView {...baseProps()} phase="failed" failure={{ message: "技能写入失败" }} />);
    const card = screen.getByTestId("skill-identity");
    expect(within(card).getByTestId("install-error-bar-message")).toHaveTextContent("技能写入失败");
  });

  it("移动端安装按钮与警示语仍在吸底栏", () => {
    mockMatchMedia(true);
    render(<SkillInstallView {...baseProps()} />);
    const bar = screen.getByTestId("action-bar");
    expect(within(bar).getByTestId("skill-install")).toBeInTheDocument();
    expect(within(bar).getByText(/技能会向 AI 注入提示词/)).toBeInTheDocument();
    expect(within(screen.getByTestId("skill-identity")).queryByTestId("skill-install")).not.toBeInTheDocument();
  });
});
