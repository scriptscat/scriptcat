import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { CspRuleSheet } from "./CspRuleSheet";

beforeAll(() => initTestLanguage("en-US"));
afterEach(cleanup);

describe("CSP 规则表单", () => {
  it("粘贴完整 URL 后显示规范化域名并提交域名 target", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(
      <CspRuleSheet open rule={undefined} baseRevision={0} existingRules={[]} onOpenChange={vi.fn()} onSave={onSave} />
    );

    const websites = screen.getByRole("textbox", { name: "Websites" });
    fireEvent.change(websites, { target: { value: "https://Example.com:8443/path" } });
    fireEvent.blur(websites);
    expect(await screen.findByText("example.com")).toBeInTheDocument();
    expect(screen.getByText("All paths and subdomains are included.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    expect(onSave).toHaveBeenCalledWith({
      name: "",
      enabled: true,
      target: { type: "domains", domains: ["example.com"] },
    });
  });

  it("表单错误就地显示且不会提交", () => {
    const onSave = vi.fn();
    render(
      <CspRuleSheet open rule={undefined} baseRevision={0} existingRules={[]} onOpenChange={vi.fn()} onSave={onSave} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    expect(screen.getByText("Enter at least one website.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("保存失败时保留表单输入", async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    render(
      <CspRuleSheet open rule={undefined} baseRevision={0} existingRules={[]} onOpenChange={vi.fn()} onSave={onSave} />
    );
    const websites = screen.getByLabelText("Websites");
    fireEvent.change(websites, { target: { value: "example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    expect(await screen.findByText("The rule could not be saved. Your form entries were kept.")).toBeInTheDocument();
    expect(websites).toHaveValue("example.com");
  });

  it("所有网站范围提交前要求确认且取消不会调用保存", () => {
    const onSave = vi.fn();
    render(
      <CspRuleSheet open rule={undefined} baseRevision={0} existingRules={[]} onOpenChange={vi.fn()} onSave={onSave} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Advanced scope" }));
    fireEvent.click(screen.getByText("All websites", { exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    expect(screen.getByRole("heading", { name: "Affect all websites?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSave).not.toHaveBeenCalled();
  });
});
