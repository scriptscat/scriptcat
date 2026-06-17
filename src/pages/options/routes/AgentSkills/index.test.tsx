import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { initLanguage } from "@App/locales/locales";
import type { SkillSummary } from "@App/app/service/agent/core/types";

const state = vi.hoisted(() => ({ skills: [] as SkillSummary[] }));

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
    fireEvent.click(screen.getByTestId("skill-import-url"));
    fireEvent.change(screen.getByTestId("skill-url-input"), { target: { value: "https://x.com/s.zip" } });
    fireEvent.click(screen.getByTestId("skill-url-confirm"));
    await waitFor(() => expect(installSkillFromUrl).toHaveBeenCalledWith("https://x.com/s.zip"));
  });
});
