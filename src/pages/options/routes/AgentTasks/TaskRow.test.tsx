// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { TaskRow } from "./TaskRow";

beforeAll(() => initTestLanguage("zh-CN"));
afterEach(() => cleanup());

const task = {
  id: "t1",
  name: "每日总结",
  mode: "internal",
  crontab: "0 9 * * *",
  enabled: true,
  notify: true,
  prompt: "总结今天",
  createtime: 0,
  updatetime: 0,
} as any;

function noop() {}

describe("TaskRow 定时任务行", () => {
  it("展示名称与 cron 表达式", () => {
    render(<TaskRow task={task} onRun={noop} onEdit={noop} onDelete={noop} onToggle={noop} onHistory={noop} />);
    expect(screen.getByText("每日总结")).toBeInTheDocument();
    expect(screen.getByText("0 9 * * *")).toBeInTheDocument();
  });

  it("点击运行按钮触发 onRun", () => {
    const onRun = vi.fn();
    render(<TaskRow task={task} onRun={onRun} onEdit={noop} onDelete={noop} onToggle={noop} onHistory={noop} />);
    fireEvent.click(screen.getByTestId("task-run"));
    expect(onRun).toHaveBeenCalled();
  });

  it("切换开关触发 onToggle", () => {
    const onToggle = vi.fn();
    render(<TaskRow task={task} onRun={noop} onEdit={noop} onDelete={noop} onToggle={onToggle} onHistory={noop} />);
    fireEvent.click(screen.getByTestId("task-toggle"));
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("菜单删除触发 onDelete", () => {
    const onDelete = vi.fn();
    render(<TaskRow task={task} onRun={noop} onEdit={noop} onDelete={onDelete} onToggle={noop} onHistory={noop} />);
    fireEvent.pointerDown(screen.getByTestId("card-menu"), { button: 0 });
    fireEvent.click(screen.getByTestId("card-menu-delete"));
    expect(onDelete).toHaveBeenCalled();
  });
});
