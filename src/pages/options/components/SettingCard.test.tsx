// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SettingCard } from "./SettingCard";
import { SettingRow } from "./SettingRow";

afterEach(cleanup);

describe("设置卡片原语", () => {
  it("SettingCard 渲染标题/描述并用 register 挂 ref", () => {
    const reg = vi.fn(() => vi.fn());
    render(
      <SettingCard id="sync" title="同步" description="云端同步" register={reg}>
        <div>inner</div>
      </SettingCard>
    );
    expect(screen.getByText("同步")).toBeInTheDocument();
    expect(screen.getByText("云端同步")).toBeInTheDocument();
    expect(screen.getByText("inner")).toBeInTheDocument();
    expect(reg).toHaveBeenCalledWith("sync");
  });

  it("SettingRow 渲染标签/描述与右侧控件", () => {
    render(
      <SettingRow label="语言" description="界面语言">
        <button>ctrl</button>
      </SettingRow>
    );
    expect(screen.getByText("语言")).toBeInTheDocument();
    expect(screen.getByText("界面语言")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ctrl" })).toBeInTheDocument();
  });
});
