// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import { initLanguage, t } from "@App/locales/locales";
import { useIsMobile } from "@App/pages/components/use-is-mobile";

const { listTasksMock } = vi.hoisted(() => ({ listTasksMock: vi.fn() }));

vi.mock("@App/app/repo/agent_task", () => ({
  AgentTaskRepo: class {
    listTasks = listTasksMock;
    saveTask = vi.fn();
    removeTask = vi.fn();
  },
  AgentTaskRunRepo: class {
    listRuns = vi.fn(async () => []);
    clearRuns = vi.fn();
  },
}));
vi.mock("@App/pages/store/features/script", () => ({ agentClient: { listModels: vi.fn(async () => []) } }));
// jsdom 未实现 matchMedia,useIsMobile 依赖它——默认桌面,移动用例单独覆盖
vi.mock("@App/pages/components/use-is-mobile", () => ({ useIsMobile: vi.fn(() => false) }));

import AgentTasks from "./index";

const sampleTask = {
  id: "t1",
  name: "每日总结",
  mode: "internal",
  crontab: "0 9 * * *",
  enabled: true,
  notify: false,
  prompt: "总结今天",
  createtime: 0,
  updatetime: 0,
};

beforeEach(() => {
  initLanguage("zh-CN");
  (useIsMobile as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
  listTasksMock.mockResolvedValue([sampleTask]);
});
afterEach(() => cleanup());

describe("AgentTasks 页面", () => {
  it("挂载后展示已配置任务", async () => {
    render(<AgentTasks />);
    await waitFor(() => expect(screen.getByText("每日总结")).toBeInTheDocument());
  });

  it("无任务时展示空状态", async () => {
    listTasksMock.mockResolvedValueOnce([]);
    render(<AgentTasks />);
    await waitFor(() => expect(screen.getByText(t("agent:tasks_no_tasks"))).toBeInTheDocument());
  });

  it("桌面页头渲染「文档」按钮并深链到定时任务文档页", async () => {
    render(<AgentTasks />);
    const docs = await screen.findByTestId("page-header-docs");
    expect(docs.getAttribute("href")).toContain("/docs/dev/agent/agent-task");
  });

  it("有任务时使用共享 CountBar 展示计数摘要", async () => {
    render(<AgentTasks />);
    await waitFor(() => expect(screen.getByTestId("count-bar")).toBeInTheDocument());
  });

  it("移动端不渲染桌面 64px 页头(交由全局 MobileHeader),改用页内顶部行", async () => {
    (useIsMobile as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
    render(<AgentTasks />);
    const topRow = await screen.findByTestId("tasks-mobile-top");
    // 页名作为页内标题
    expect(topRow).toHaveTextContent(t("agent:tasks_title"));
    // 新建按钮在页内顶部行
    expect(screen.getByTestId("task-add")).toBeInTheDocument();
    // 移动端不渲染桌面 64px 页头(无图标块)与「文档」外框按钮,也不另起 52px AppBar
    expect(screen.queryByTestId("page-header-docs")).toBeNull();
    expect(screen.queryByTestId("tasks-mobile-bar")).toBeNull();
  });
});
