import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

const { get, set } = vi.hoisted(() => ({
  get: vi.fn((key: string) => {
    if (key === "enable_eslint") return Promise.resolve(true);
    return Promise.resolve("");
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

import { initLanguage } from "@App/locales/locales";
import { DeveloperSection } from "./DeveloperSection";

beforeAll(() => {
  initLanguage("zh-CN");
});

afterEach(cleanup);

describe("开发者分区", () => {
  it("应将 ESLint 开关放在 ESLint 规则标签页内", async () => {
    render(<DeveloperSection register={() => () => {}} />);
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "ESLint规则" }));

    expect(screen.getAllByText("检查脚本代码质量和错误")).toHaveLength(1);
    expect(screen.getByTestId("eslint_rules_editor")).toBeInTheDocument();
  });

  it("应使用标签页切换编辑器配置与类型定义", async () => {
    render(<DeveloperSection register={() => () => {}} />);

    fireEvent.mouseDown(await screen.findByRole("tab", { name: "编辑器配置" }));
    await screen.findByTestId("editor_config_editor");
    const link = screen.getByRole("link", { name: "jsconfig.js" });
    expect(link).toHaveAttribute("href", "https://code.visualstudio.com/docs/languages/jsconfig");

    fireEvent.mouseDown(screen.getByRole("tab", { name: "编辑器类型定义" }));
    await screen.findByTestId("editor_type_definition_editor");
    expect(screen.getByText("你可以自定义自己的类型定义，脚本编辑器会自动加载这些类型定义")).toBeInTheDocument();
  });

  it("编辑器类型定义失焦时写入 editor_type_definition", async () => {
    render(<DeveloperSection register={() => () => {}} />);
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "编辑器类型定义" }));
    const editor = await screen.findByTestId("editor_type_definition_editor");
    await waitFor(() => expect(get).toHaveBeenCalledWith("editor_type_definition"));
    fireEvent.change(editor, { target: { value: "declare const x: any;" } });
    fireEvent.blur(editor);

    expect(set).toHaveBeenCalledWith("editor_type_definition", "declare const x: any;");
  });
});
