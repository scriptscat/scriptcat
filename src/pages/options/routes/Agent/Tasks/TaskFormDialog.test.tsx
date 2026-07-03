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
  it("内部模式显示提示词，切换到事件模式后隐藏", () => {
    setup();
    expect(screen.getByTestId("task-prompt")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("task-mode-event"));
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
