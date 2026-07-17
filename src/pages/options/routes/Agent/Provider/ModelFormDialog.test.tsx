import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { ModelFormDialog } from "./ModelFormDialog";
import { getDefaultBaseUrl } from "./provider_api";

beforeAll(() => initTestLanguage("zh-CN"));
afterEach(() => cleanup());

function setup(props: Record<string, unknown> = {}) {
  const onSubmit = vi.fn();
  const onTest = vi.fn(async () => ({ ok: true, latencyMs: 12 }));
  const onFetchModels = vi.fn(async () => ["gpt-4o"]);
  const onOpenChange = vi.fn();
  render(
    <ModelFormDialog
      open
      value={null}
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      onTest={onTest}
      onFetchModels={onFetchModels}
      {...props}
    />
  );
  return { onSubmit, onTest, onFetchModels, onOpenChange };
}

describe("ModelFormDialog 模型表单弹窗", () => {
  it("拉取后从下拉选择模型并保存，回调带表单值", async () => {
    const { onSubmit, onFetchModels } = setup();
    fireEvent.change(screen.getByTestId("model-name"), { target: { value: "My GPT" } });
    // 拉取可用模型列表 -> 填充下拉选项（异步，需等待 state 更新后再展开下拉）
    fireEvent.click(screen.getByTestId("model-fetch"));
    expect(onFetchModels).toHaveBeenCalled();
    // 用键盘展开 Radix Select(测试环境下 pointerDown 不触发其打开)，再选择拉取到的模型
    const trigger = screen.getByTestId("model-id");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.click(await screen.findByTestId("model-option-gpt-4o"));
    fireEvent.click(screen.getByTestId("model-submit"));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: "My GPT", model: "gpt-4o" }));
  });

  it("点击测试连接调用 onTest", () => {
    const { onTest } = setup();
    fireEvent.change(screen.getByTestId("model-name"), { target: { value: "n" } });
    fireEvent.click(screen.getByTestId("model-test"));
    expect(onTest).toHaveBeenCalled();
  });

  it("provider 默认 openai 时 Base URL 占位为 openai 地址", () => {
    setup();
    expect(screen.getByTestId("model-base-url")).toHaveAttribute("placeholder", getDefaultBaseUrl("openai"));
  });

  it("编辑模式回填已有值", () => {
    const { onSubmit } = setup({
      value: { id: "9", name: "Claude", provider: "anthropic", apiBaseUrl: "", apiKey: "k", model: "claude-3" },
    });
    expect((screen.getByTestId("model-name") as HTMLInputElement).value).toBe("Claude");
    // 模型字段已是 Select：通过提交回传验证既有 model 被回填保留
    fireEvent.click(screen.getByTestId("model-submit"));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: "Claude", model: "claude-3" }));
  });
});
