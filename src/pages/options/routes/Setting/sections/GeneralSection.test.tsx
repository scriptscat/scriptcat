// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const { get, set } = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("@App/pages/store/global", () => ({
  systemConfig: { get, set },
  subscribeMessage: () => () => {},
}));

const { success } = vi.hoisted(() => ({ success: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success, error: vi.fn(), info: vi.fn() } }));

import { initLanguage } from "@App/locales/locales";
import { GeneralSection } from "./GeneralSection";

beforeAll(() => {
  initLanguage("zh-CN");
});

afterEach(() => {
  cleanup();
  get.mockReset();
  set.mockReset();
  success.mockReset();
});

describe("通用分区-界面语言", () => {
  it("选择界面显示语言文案只出现一次（不重复卡片描述与行描述）", async () => {
    get.mockResolvedValue("");
    render(<GeneralSection register={() => () => {}} />);
    await screen.findByText("选择界面显示语言");
    expect(screen.getAllByText("选择界面显示语言")).toHaveLength(1);
  });

  it("语言下拉末尾包含「协助翻译」入口，点击后打开讨论页且不修改已存语言", async () => {
    get.mockResolvedValue("zh-CN");
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<GeneralSection register={() => () => {}} />);

    fireEvent.click(await screen.findByRole("combobox"));
    const helpOption = await screen.findByText("协助翻译");
    fireEvent.click(helpOption);

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith("https://github.com/scriptscat/scriptcat/discussions/531", "_blank");
    });
    // 协助翻译不应改变已存语言，也不应弹出语言切换提示
    expect(set).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it("切换界面语言后弹出切换成功提示", async () => {
    get.mockResolvedValue("zh-CN");
    render(<GeneralSection register={() => () => {}} />);

    fireEvent.click(await screen.findByRole("combobox"));
    const enOption = await screen.findByText("English");
    fireEvent.click(enOption);

    await waitFor(() => {
      expect(set).toHaveBeenCalledWith("language", "en-US");
    });
    expect(success).toHaveBeenCalledWith("语言切换成功");
  });
});
