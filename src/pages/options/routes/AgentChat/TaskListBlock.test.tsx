// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import type { Task } from "@App/app/service/agent/core/tools/task_tools";
import TaskListBlock from "./TaskListBlock";

beforeAll(() => initTestLanguage("zh-CN"));
afterEach(() => cleanup());

const task = (id: string, status: Task["status"], subject = id): Task => ({
  id,
  subject,
  status,
});

describe("任务清单块 TaskListBlock", () => {
  it("无任务时不渲染", () => {
    const { container } = render(<TaskListBlock tasks={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("展示完成进度 completed/total", () => {
    render(<TaskListBlock tasks={[task("a", "completed"), task("b", "in_progress"), task("c", "pending")]} />);
    expect(screen.getByTestId("task-progress").textContent).toContain("1");
    expect(screen.getByTestId("task-progress").textContent).toContain("3");
  });

  it("每个任务按 status 标注状态", () => {
    render(<TaskListBlock tasks={[task("a", "completed"), task("b", "pending")]} />);
    expect(screen.getByTestId("task-a").dataset.status).toBe("completed");
    expect(screen.getByTestId("task-b").dataset.status).toBe("pending");
  });

  it("展示每个任务的标题", () => {
    render(<TaskListBlock tasks={[task("a", "in_progress", "抓取首页")]} />);
    expect(screen.getByText("抓取首页")).toBeInTheDocument();
  });
});
