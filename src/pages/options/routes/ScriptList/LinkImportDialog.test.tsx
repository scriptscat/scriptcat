// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LinkImportDialog } from "./LinkImportDialog";

describe("LinkImportDialog", () => {
  it("提交时把多行文本拆成 URL 数组(忽略空行)", () => {
    const onSubmit = vi.fn();
    render(<LinkImportDialog open onOpenChange={() => {}} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByTestId("link-import-textarea"), {
      target: { value: "https://a.com/a.user.js\n\nhttps://b.com/b.zip\n" },
    });
    fireEvent.click(screen.getByTestId("link-import-submit"));
    expect(onSubmit).toHaveBeenCalledWith(["https://a.com/a.user.js", "https://b.com/b.zip"]);
  });
});
