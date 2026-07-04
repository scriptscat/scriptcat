import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";

const { get, set } = vi.hoisted(() => ({
  get: vi.fn((key: string) => {
    if (key === "editor_preferences")
      return Promise.resolve({ version: 1, fontSize: 14, mouseWheelScrollSensitivity: 1, smoothScrolling: true });
    if (key === "editor_config") return Promise.resolve("{}");
    if (key === "editor_type_definition") return Promise.resolve("declare const GM_info: unknown;");
    if (key === "enable_eslint") return Promise.resolve(true);
    if (key === "eslint_config") return Promise.resolve("{}");
    return Promise.resolve(undefined);
  }),
  set: vi.fn(),
}));

vi.mock("@App/pages/store/global", async () => {
  const { createGlobalStoreMock } = await import("@Tests/mocks/pageStores.ts");
  return createGlobalStoreMock({ systemConfig: { get, set } });
});

vi.mock("./DeveloperMonacoEditor", () => ({
  DeveloperMonacoEditor: ({
    value,
    onChange,
    onBlur,
    "data-testid": testId,
    ariaLabel,
  }: {
    value: string;
    onChange: (value: string) => void;
    onBlur: () => void;
    ariaLabel: string;
    "data-testid"?: string;
  }) => (
    <textarea
      data-testid={testId}
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
    />
  ),
}));

vi.mock("@App/pages/components/ui/slider", () => ({
  Slider: ({
    value,
    onValueChange,
    "aria-label": ariaLabel,
  }: {
    value: number[];
    onValueChange: (value: number[]) => void;
    "aria-label": string;
  }) => (
    <input
      aria-label={ariaLabel}
      type="range"
      value={value[0]}
      onChange={(event) => onValueChange([Number(event.target.value)])}
    />
  ),
}));

import { DeveloperSection } from "./DeveloperSection";

beforeAll(() => initTestLanguage("en-US"));

beforeEach(() => {
  get.mockClear();
  set.mockClear();
});

afterEach(cleanup);

describe("开发者设置区", () => {
  it("应将 ESLint 开关放在 ESLint 规则标签页内", async () => {
    render(<DeveloperSection register={() => () => {}} />);

    expect(await screen.findByText("Check script code quality and errors")).toBeInTheDocument();
    expect(screen.getByTestId("eslint_rules_editor")).toBeInTheDocument();
  });

  it("应使用标签页切换编辑器配置与类型定义", async () => {
    render(<DeveloperSection register={() => () => {}} />);

    const editorConfigTab = screen.getByText("Editor Configuration").closest('[role="tab"]')!;
    fireEvent.pointerDown(editorConfigTab, { button: 0, ctrlKey: false });
    fireEvent.pointerUp(editorConfigTab, { button: 0, ctrlKey: false });
    fireEvent.click(editorConfigTab);
    fireEvent.keyDown(editorConfigTab, { key: "Enter" });
    await screen.findByTestId("editor_config_editor");
    const link = screen.getByText("jsconfig.js").closest("a")!;
    expect(link).toHaveAttribute("href", "https://code.visualstudio.com/docs/languages/jsconfig");

    const typeDefinitionTab = screen.getByText("Editor Type Definition").closest('[role="tab"]')!;
    fireEvent.pointerDown(typeDefinitionTab, { button: 0, ctrlKey: false });
    fireEvent.pointerUp(typeDefinitionTab, { button: 0, ctrlKey: false });
    fireEvent.click(typeDefinitionTab);
    fireEvent.keyDown(typeDefinitionTab, { key: "Enter" });
    await screen.findByTestId("editor_type_definition_editor");
    expect(
      screen.getByText(
        "You can customize your own type definitions, and the script editor will automatically load these type definitions"
      )
    ).toBeInTheDocument();
  });

  it("编辑器类型定义失焦时写入 editor_type_definition", async () => {
    render(<DeveloperSection register={() => () => {}} />);

    const typeDefinitionTab = screen.getByText("Editor Type Definition").closest('[role="tab"]')!;
    fireEvent.pointerDown(typeDefinitionTab, { button: 0, ctrlKey: false });
    fireEvent.pointerUp(typeDefinitionTab, { button: 0, ctrlKey: false });
    fireEvent.click(typeDefinitionTab);
    fireEvent.keyDown(typeDefinitionTab, { key: "Enter" });
    const editor = await screen.findByTestId("editor_type_definition_editor");
    await waitFor(() => expect(get).toHaveBeenCalledWith("editor_type_definition"));
    fireEvent.change(editor, { target: { value: "declare const x: unknown;" } });
    fireEvent.blur(editor);

    expect(set).toHaveBeenCalledWith("editor_type_definition", "declare const x: unknown;");
  });

  it("编辑器配置应包含常用 Monaco 偏好并保存修改", async () => {
    render(<DeveloperSection register={() => () => {}} />);

    const editorConfigTab = screen.getByText("Editor Configuration").closest('[role="tab"]')!;
    fireEvent.pointerDown(editorConfigTab, { button: 0, ctrlKey: false });
    fireEvent.pointerUp(editorConfigTab, { button: 0, ctrlKey: false });
    fireEvent.click(editorConfigTab);
    fireEvent.keyDown(editorConfigTab, { key: "Enter" });

    const fontSize = await screen.findByLabelText("Font Size");
    fireEvent.change(fontSize, { target: { value: "16" } });
    expect(set).toHaveBeenLastCalledWith("editor_preferences", {
      version: 1,
      fontSize: 16,
      mouseWheelScrollSensitivity: 1,
      smoothScrolling: true,
    });

    const sensitivity = screen.getByLabelText("Mouse Wheel Scroll Sensitivity");
    fireEvent.change(sensitivity, { target: { value: "1.5" } });
    expect(set).toHaveBeenLastCalledWith("editor_preferences", {
      version: 1,
      fontSize: 16,
      mouseWheelScrollSensitivity: 1.5,
      smoothScrolling: true,
    });

    fireEvent.click(screen.getByLabelText("Smooth Scrolling"));
    expect(set).toHaveBeenLastCalledWith("editor_preferences", {
      version: 1,
      fontSize: 16,
      mouseWheelScrollSensitivity: 1.5,
      smoothScrolling: false,
    });
  });
});
