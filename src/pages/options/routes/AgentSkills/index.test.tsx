import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { initLanguage } from "@App/locales/locales";
import { useIsMobile } from "@App/pages/components/use-is-mobile";
import type { SkillSummary } from "@App/app/service/agent/core/types";

const state = vi.hoisted(() => ({ skills: [] as SkillSummary[] }));

// jsdom 未实现 matchMedia,useIsMobile 依赖它——默认桌面,移动用例单独覆盖
vi.mock("@App/pages/components/use-is-mobile", () => ({ useIsMobile: vi.fn(() => false) }));

vi.mock("./skill_install", () => ({
  installSkillFromZip: vi.fn(() => Promise.resolve()),
  installSkillFromUrl: vi.fn(() => Promise.resolve()),
}));
vi.mock("../AgentChat/hooks", () => ({
  useSkills: () => ({ skills: state.skills, loadSkills: vi.fn() }),
}));

import { installSkillFromZip, installSkillFromUrl } from "./skill_install";
import AgentSkills from "./index";

const skill = (over: Partial<SkillSummary> = {}): SkillSummary => ({
  name: "翻译助手",
  description: "翻译当前网页内容",
  toolNames: ["translate"],
  referenceNames: [],
  installtime: 0,
  updatetime: 0,
  ...over,
});

beforeEach(() => {
  state.skills = [];
  vi.clearAllMocks();
  vi.mocked(useIsMobile).mockReturnValue(false);
  initLanguage("zh-CN");
});
afterEach(cleanup);

describe("AgentSkills 页面", () => {
  it("无已安装 Skill 时显示空状态", () => {
    render(<AgentSkills />);
    expect(screen.getByText("暂无已安装的 Skill")).toBeInTheDocument();
  });

  it("渲染已安装 Skill 的名称与描述", () => {
    state.skills = [skill()];
    render(<AgentSkills />);
    expect(screen.getByText("翻译助手")).toBeInTheDocument();
    expect(screen.getByText("翻译当前网页内容")).toBeInTheDocument();
  });

  it("选择 ZIP 文件后调用 installSkillFromZip", async () => {
    render(<AgentSkills />);
    const file = new File([new Uint8Array([1])], "s.zip", { type: "application/zip" });
    const input = screen.getByTestId("skill-zip-input");
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(installSkillFromZip).toHaveBeenCalledWith(file));
  });

  it("从 URL 导入时以填入的地址调用 installSkillFromUrl", async () => {
    render(<AgentSkills />);
    // 先展开「添加」菜单(Radix 仅在打开时挂载菜单项),再选择「从 URL 导入」
    fireEvent.pointerDown(screen.getByTestId("skill-add"), { button: 0 });
    fireEvent.click(await screen.findByTestId("skill-import-url"));
    fireEvent.change(screen.getByTestId("skill-url-input"), { target: { value: "https://x.com/s.zip" } });
    fireEvent.click(screen.getByTestId("skill-url-confirm"));
    await waitFor(() => expect(installSkillFromUrl).toHaveBeenCalledWith("https://x.com/s.zip"));
  });

  it("桌面页头通过 docHref 渲染统一「文档」按钮", () => {
    state.skills = [skill()];
    render(<AgentSkills />);
    const docs = screen.getByTestId("page-header-docs");
    expect(docs).toBeInTheDocument();
    expect(docs).toHaveAttribute("href");
    expect(docs.getAttribute("href")).toContain("agent-skill-install");
  });

  it("有已安装 Skill 时通过共享 CountBar 展示统计", () => {
    state.skills = [skill(), skill({ name: "助手B", description: "另一个" })];
    render(<AgentSkills />);
    const bar = screen.getByTestId("count-bar");
    expect(bar).toBeInTheDocument();
    expect(bar.textContent).toContain("2");
  });

  it("移动端不渲染 64px 页头(避免与全局 MobileHeader 叠加双头部)", () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    state.skills = [skill()];
    render(<AgentSkills />);
    // 桌面页头(含文档按钮)在移动端不出现;改由全局 MobileHeader + 页内添加入口承担
    expect(screen.queryByTestId("page-header-docs")).not.toBeInTheDocument();
    // 移动端仍可发起添加
    expect(screen.getByTestId("skill-add")).toBeInTheDocument();
  });

  it("移动端在页内顶行显示页面名称(全局栏仅显示静态 ScriptCat)", () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    state.skills = [skill()];
    render(<AgentSkills />);
    const heading = screen.getByTestId("skills-mobile-heading");
    expect(heading).toBeInTheDocument();
    expect(heading.textContent).toBe("Skills 管理");
  });
});
