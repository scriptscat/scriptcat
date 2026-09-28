import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, values: { line: number; col: number }) => `${values.line}:${values.col}`,
  }),
}));

import EditorStatusBar from "./EditorStatusBar";

afterEach(cleanup);

describe("EditorStatusBar", () => {
  it("status 为空时不应渲染状态栏占位", () => {
    const { container } = render(<EditorStatusBar status={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("status 存在时应显示光标位置和代码大小", () => {
    render(<EditorStatusBar status={{ line: 3, col: 7, size: 1536 }} />);

    expect(screen.getByText("3:7")).toBeInTheDocument();
    expect(screen.getByText("1.5 KB")).toBeInTheDocument();
  });
});
