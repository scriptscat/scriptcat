import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { t } from "@App/locales/locales";
import { TaskFormDialog } from "./TaskFormDialog";

beforeAll(() => initTestLanguage("zh-CN"));
afterEach(() => cleanup());

function setup(props: Record<string, unknown> = {}) {
  const onSubmit = vi.fn();
  render(<TaskFormDialog open value={null} models={[]} onOpenChange={() => {}} onSubmit={onSubmit} {...props} />);
  return { onSubmit };
}

describe("TaskFormDialog 定时任务弹窗", () => {
  it("新建任务时事件模式不可选，因为 Options 无法像脚本上下文那样自动注入来源脚本 UUID", () => {
    setup();
    expect(screen.getByTestId("task-prompt")).toBeInTheDocument();
    expect(screen.getByTestId("task-mode-event")).toBeDisabled();
    fireEvent.click(screen.getByTestId("task-mode-event"));
    // 禁用状态下点击不应切换模式，提示词字段应保持可见
    expect(screen.getByTestId("task-prompt")).toBeInTheDocument();
  });

  it("编辑已有事件任务时事件模式保持可选并隐藏提示词", () => {
    const onSubmit = vi.fn();
    const eventTask = {
      id: "task-event-1",
      name: "事件任务",
      mode: "event" as const,
      crontab: "0 9 * * *",
      enabled: true,
      notify: false,
      sourceScriptUuid: "script-1",
      createtime: 1,
      updatetime: 1,
    };
    // 组件用「渲染期比较上一次的 open/value」同步外部 prop：初始挂载时 value 与其自身相等不会触发同步，
    // 需先以 value=null 挂载，再 rerender 传入编辑值，才能复现真实的「打开编辑」场景
    const { rerender } = render(
      <TaskFormDialog open={false} value={null} models={[]} onOpenChange={() => {}} onSubmit={onSubmit} />
    );
    rerender(<TaskFormDialog open value={eventTask} models={[]} onOpenChange={() => {}} onSubmit={onSubmit} />);

    expect(screen.getByTestId("task-mode-event")).not.toBeDisabled();
    expect(screen.queryByTestId("task-prompt")).toBeNull();
  });

  it("非法 cron 表达式显示错误提示", () => {
    setup();
    fireEvent.change(screen.getByTestId("task-cron"), { target: { value: "bad cron" } });
    expect(screen.getByTestId("task-cron-error")).toBeInTheDocument();
  });

  it("没有模型时展示空状态文案并禁用模型选择", () => {
    setup();
    const trigger = screen.getByTestId("task-model");
    expect(trigger).toHaveTextContent(t("agent:model_no_models"));
    expect(trigger).toBeDisabled();
  });

  it("填写名称与合法 cron 后保存，回调带表单值", () => {
    const { onSubmit } = setup();
    fireEvent.change(screen.getByTestId("task-name"), { target: { value: "每日总结" } });
    fireEvent.change(screen.getByTestId("task-cron"), { target: { value: "0 9 * * *" } });
    fireEvent.click(screen.getByTestId("task-submit"));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "每日总结", mode: "internal", crontab: "0 9 * * *" })
    );
  });
});
