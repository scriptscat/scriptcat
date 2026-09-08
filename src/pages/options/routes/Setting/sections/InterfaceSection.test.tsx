import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

const { get, set } = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("@App/pages/store/global", async () => {
  const { createGlobalStoreMock } = await import("@Tests/mocks/pageStores.ts");
  return createGlobalStoreMock({ systemConfig: { get, set } });
});

import { initTestLanguage } from "@Tests/initTestLanguage";
import { InterfaceSection } from "./InterfaceSection";

beforeAll(() => {
  initTestLanguage("zh-CN");
});

afterEach(() => {
  cleanup();
  get.mockReset();
  set.mockReset();
});

describe("界面分区-图标服务", () => {
  it("图标服务文案只出现一次（不重复小标题与行标签）", async () => {
    get.mockResolvedValue("");
    render(<InterfaceSection register={() => () => {}} />);
    await screen.findByText("图标服务");
    expect(screen.getAllByText("图标服务")).toHaveLength(1);
  });

  it("扩展图标徽标文案只出现一次（不重复卡片描述与小标题）", async () => {
    get.mockResolvedValue("");
    render(<InterfaceSection register={() => () => {}} />);
    await screen.findByText("扩展图标徽标");
    expect(screen.getAllByText("扩展图标徽标")).toHaveLength(1);
  });

  // 图标服务可整体关闭：选中 none 时下拉框需回显「禁用」，否则用户无从选择这一档
  it("图标服务为 none 时下拉框回显禁用", async () => {
    get.mockImplementation((key: string) => Promise.resolve(key === "favicon_service" ? "none" : ""));
    render(<InterfaceSection register={() => () => {}} />);
    expect(await screen.findByText("禁用")).toBeInTheDocument();
  });
});

describe("界面分区-popup 布局", () => {
  it("应显示紧凑布局开关并保存切换结果", async () => {
    get.mockImplementation((key: string) => Promise.resolve(key === "popup_compact_layout"));
    render(<InterfaceSection register={() => () => {}} />);

    await screen.findByText("紧凑弹窗布局");
    const compactSwitch = screen.getByRole("switch", { name: "紧凑弹窗布局" });
    expect(compactSwitch).toBeChecked();

    fireEvent.click(compactSwitch);
    expect(set).toHaveBeenCalledWith("popup_compact_layout", false);
  });
});

// 两个展开数量此前共用「展开数量 / 超过此数量时自动折叠」文案，用户误以为它管脚本列表（#1558）
describe("界面分区-展开数量", () => {
  const numbers = (key: string) => Promise.resolve(key === "script_list_expand_num" ? 5 : 5);

  it("脚本列表与脚本菜单各有一个数量设置，文案互不混淆", async () => {
    get.mockImplementation(numbers);
    render(<InterfaceSection register={() => () => {}} />);

    expect(await screen.findByText("脚本列表展开数量")).toBeInTheDocument();
    expect(screen.getByText("菜单展开数量")).toBeInTheDocument();
    expect(screen.queryByText("展开数量")).not.toBeInTheDocument();
  });

  it("修改脚本列表展开数量应写入 script_list_expand_num", async () => {
    get.mockImplementation(numbers);
    render(<InterfaceSection register={() => () => {}} />);

    const input = await screen.findByLabelText("脚本列表展开数量");
    fireEvent.change(input, { target: { value: "21" } });

    expect(set).toHaveBeenCalledWith("script_list_expand_num", 21);
  });

  it("修改菜单展开数量应写入 menu_expand_num", async () => {
    get.mockImplementation(numbers);
    render(<InterfaceSection register={() => () => {}} />);

    const input = await screen.findByLabelText("菜单展开数量");
    fireEvent.change(input, { target: { value: "3" } });

    expect(set).toHaveBeenCalledWith("menu_expand_num", 3);
  });
});
