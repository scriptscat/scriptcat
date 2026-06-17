import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const { get, set } = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("@App/pages/store/global", () => ({
  systemConfig: { get, set },
  subscribeMessage: () => () => {},
}));

import { initLanguage } from "@App/locales/locales";
import { GeneralSection } from "./GeneralSection";

beforeAll(() => {
  initLanguage("zh-CN");
});

afterEach(() => {
  cleanup();
  get.mockReset();
  set.mockReset();
});

describe("通用分区-界面语言", () => {
  it("选择界面显示语言文案只出现一次（不重复卡片描述与行描述）", async () => {
    get.mockResolvedValue("");
    render(<GeneralSection register={() => () => {}} />);
    await screen.findByText("选择界面显示语言");
    expect(screen.getAllByText("选择界面显示语言")).toHaveLength(1);
  });
});
