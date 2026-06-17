import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { initLanguage } from "@App/locales/locales";
import { ModelFormDialog } from "./ModelFormDialog";
import { getDefaultBaseUrl } from "./provider_api";

beforeEach(() => initLanguage("zh-CN"));
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
  it("填写名称与模型后保存，回调带表单值", () => {
    const { onSubmit } = setup();
    fireEvent.change(screen.getByTestId("model-name"), { target: { value: "My GPT" } });
    fireEvent.change(screen.getByTestId("model-id"), { target: { value: "gpt-4o" } });
    fireEvent.click(screen.getByTestId("model-submit"));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: "My GPT", model: "gpt-4o" }));
  });

  it("点击测试连接调用 onTest", () => {
    const { onTest } = setup();
    fireEvent.change(screen.getByTestId("model-name"), { target: { value: "n" } });
    fireEvent.change(screen.getByTestId("model-id"), { target: { value: "m" } });
    fireEvent.click(screen.getByTestId("model-test"));
    expect(onTest).toHaveBeenCalled();
  });

  it("provider 默认 openai 时 Base URL 占位为 openai 地址", () => {
    setup();
    expect(screen.getByTestId("model-base-url")).toHaveAttribute("placeholder", getDefaultBaseUrl("openai"));
  });

  it("编辑模式回填已有值", () => {
    setup({
      value: { id: "9", name: "Claude", provider: "anthropic", apiBaseUrl: "", apiKey: "k", model: "claude-3" },
    });
    expect((screen.getByTestId("model-name") as HTMLInputElement).value).toBe("Claude");
    expect((screen.getByTestId("model-id") as HTMLInputElement).value).toBe("claude-3");
  });
});
