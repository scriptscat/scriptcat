import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

const h = vi.hoisted(() => {
  const dispose = vi.fn();
  return {
    dispose,
    create: vi.fn((_container: HTMLElement, _options: Record<string, unknown>) => ({ dispose })),
    setTheme: vi.fn(),
  };
});

vi.mock("monaco-editor", () => ({ editor: { create: h.create, setTheme: h.setTheme } }));
vi.mock("@App/pkg/utils/monaco-editor", () => ({ registerEditor: vi.fn() }));
vi.mock("@App/pages/components/theme-provider", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));
vi.mock("@App/pages/components/CodeEditor/theme", () => ({ resolveMonacoTheme: (theme: string) => theme }));

import { ResourceCodeViewer } from "./ResourceCodeViewer";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ResourceCodeViewer 资源只读查看器", () => {
  it("以只读 Monaco 按指定语言展示缓存文本，卸载时释放实例", () => {
    const view = render(<ResourceCodeViewer value="a { color: red; }" language="css" ariaLabel="style.css" />);

    expect(h.create).toHaveBeenCalledOnce();
    expect(h.create.mock.calls[0][1]).toMatchObject({
      value: "a { color: red; }",
      language: "css",
      readOnly: true,
      theme: "dark",
    });

    view.unmount();
    expect(h.dispose).toHaveBeenCalledOnce();
  });
});
