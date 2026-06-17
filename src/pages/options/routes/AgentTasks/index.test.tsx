import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import { initLanguage, t } from "@App/locales/locales";

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
});
