import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { TaskHistorySheet } from "./TaskHistorySheet";

beforeAll(() => initTestLanguage("zh-CN"));
afterEach(() => cleanup());

const task = { id: "t1", name: "每日总结", mode: "internal", crontab: "0 9 * * *" } as any;
const runs = [
  {
    id: "r1",
    taskId: "t1",
    starttime: 1_700_000_000_000,
    endtime: 1_700_000_005_000,
    status: "success",
    usage: { inputTokens: 10, outputTokens: 20 },
  },
] as any;

describe("TaskHistorySheet 运行历史抽屉", () => {
  it("渲染运行记录行", () => {
    render(
      <TaskHistorySheet open task={task} runs={runs} loading={false} onClear={() => {}} onOpenChange={() => {}} />
    );
    expect(screen.getByText("成功")).toBeInTheDocument();
  });

  it("loading 时显示加载状态", () => {
    render(<TaskHistorySheet open task={task} runs={[]} loading onClear={() => {}} onOpenChange={() => {}} />);
    expect(screen.getByTestId("history-loading")).toBeInTheDocument();
  });

  it("确认清空历史触发 onClear", () => {
    const onClear = vi.fn();
    render(<TaskHistorySheet open task={task} runs={runs} loading={false} onClear={onClear} onOpenChange={() => {}} />);
    fireEvent.click(screen.getByTestId("history-clear"));
    fireEvent.click(screen.getByText("确定"));
    expect(onClear).toHaveBeenCalled();
  });
});
