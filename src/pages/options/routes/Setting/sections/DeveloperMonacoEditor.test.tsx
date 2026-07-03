import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

const h = vi.hoisted(() => ({
  create: vi.fn((_container: HTMLElement, _options: Record<string, unknown>) => ({
    getValue: () => "",
    setValue: vi.fn(),
    dispose: vi.fn(),
    onDidChangeModelContent: () => ({ dispose: vi.fn() }),
    onDidBlurEditorWidget: () => ({ dispose: vi.fn() }),
  })),
  setTheme: vi.fn(),
}));

vi.mock("monaco-editor", () => ({
  editor: {
    create: h.create,
    setTheme: h.setTheme,
  },
}));
vi.mock("@App/pkg/utils/monaco-editor", () => ({ registerEditor: vi.fn() }));
vi.mock("@App/pages/components/theme-provider", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));
vi.mock("@App/pages/components/CodeEditor/theme", () => ({ resolveMonacoTheme: (theme: string) => theme }));

import { DeveloperMonacoEditor } from "./DeveloperMonacoEditor";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("开发者 Monaco 编辑器", () => {
  it("应将溢出浮层固定渲染以避免 hover/quick fix 被容器裁切", () => {
    render(
      <DeveloperMonacoEditor
        id="developer-test-editor"
        value="{}"
        language="json"
        ariaLabel="编辑器配置"
        onChange={() => {}}
        onBlur={() => {}}
      />
    );

    expect(h.create).toHaveBeenCalled();
    expect(h.create.mock.calls[0][1]).toMatchObject({
      fixedOverflowWidgets: true,
    });
  });
});
