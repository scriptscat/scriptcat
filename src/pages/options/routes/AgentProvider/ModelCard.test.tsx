import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { initLanguage } from "@App/locales/locales";
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
      <ModelCard model={model} isDefault onEdit={() => {}} onCopy={() => {}} onSetDefault={() => {}} onDelete={() => {}} />
    );
    expect(screen.getByText("GPT-4o")).toBeInTheDocument();
    expect(screen.getByText("gpt-4o")).toBeInTheDocument();
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
