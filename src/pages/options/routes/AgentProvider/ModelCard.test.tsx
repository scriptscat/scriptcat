// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { initLanguage, t } from "@App/locales/locales";
import { ModelCard } from "./ModelCard";

beforeEach(() => initLanguage("zh-CN"));
afterEach(() => cleanup());

const model = {
  id: "1",
  name: "GPT-4o",
  provider: "openai",
  apiBaseUrl: "",
  apiKey: "sk-abcdef012345",
  model: "gpt-4o",
  supportsVision: true,
} as any;

describe("ModelCard 模型卡片", () => {
  it("展示名称、模型 ID 与默认徽章", () => {
    render(
      <ModelCard
        model={model}
        isDefault
        onEdit={() => {}}
        onCopy={() => {}}
        onSetDefault={() => {}}
        onDelete={() => {}}
      />
    );
    expect(screen.getByText("GPT-4o")).toBeInTheDocument();
    expect(screen.getByText("gpt-4o")).toBeInTheDocument();
  });

  it("默认徽章为纯文字胶囊，不含图标", () => {
    const { container } = render(
      <ModelCard
        model={model}
        isDefault
        onEdit={() => {}}
        onCopy={() => {}}
        onSetDefault={() => {}}
        onDelete={() => {}}
      />
    );
    const badge = screen.getByText(t("agent:model_default_label"));
    expect(badge).toBeInTheDocument();
    // 设计稿默认徽章仅文字（圆角全胶囊），不带 ✓ 等图标
    expect(badge.querySelector("svg")).toBeNull();
    expect(container).toBeTruthy();
  });

  it("掩码 apiKey，不暴露完整密钥", () => {
    render(
      <ModelCard
        model={model}
        isDefault={false}
        onEdit={() => {}}
        onCopy={() => {}}
        onSetDefault={() => {}}
        onDelete={() => {}}
      />
    );
    expect(screen.queryByText("sk-abcdef012345")).toBeNull();
  });

  it("菜单删除触发 onDelete", () => {
    const onDelete = vi.fn();
    render(
      <ModelCard
        model={model}
        isDefault={false}
        onEdit={() => {}}
        onCopy={() => {}}
        onSetDefault={() => {}}
        onDelete={onDelete}
      />
    );
    fireEvent.pointerDown(screen.getByTestId("card-menu"), { button: 0 });
    fireEvent.click(screen.getByTestId("card-menu-delete"));
    expect(onDelete).toHaveBeenCalled();
  });
});
