import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { initLanguage, t } from "@App/locales/locales";
import { requestDeleteSubscribe } from "@App/pages/store/features/subscribe";
import type { SubscribeLoading } from "@App/pages/store/features/subscribe";

// 数据 Hook 涉及后台读取，测试中整体打桩；返回值须为稳定引用避免无限重渲染。
const { mockSubscribeData } = vi.hoisted(() => ({
  mockSubscribeData: {
    subscribeList: [] as SubscribeLoading[],
    setSubscribeList: vi.fn(),
    loadingList: false,
  },
}));
vi.mock("./hooks", () => ({
  useSubscribeDataManagement: () => mockSubscribeData,
}));

// 业务请求打桩，重点观察 requestDeleteSubscribe 是否被调用
vi.mock("@App/pages/store/features/subscribe", () => ({
  requestDeleteSubscribe: vi.fn(() => Promise.resolve(true)),
  requestEnableSubscribe: vi.fn(() => Promise.resolve(true)),
  requestCheckSubscribeUpdate: vi.fn(() => Promise.resolve(false)),
}));

// toast 仅做提示，打桩避免依赖全局 Toaster
vi.mock("@App/pages/components/ui/toast", () => ({
  notify: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    promise: vi.fn(),
    undo: vi.fn(),
    dismiss: vi.fn(),
  },
}));

// 用轻量替身替换表格：暴露一个触发删除的按钮，调用容器传入的 handleDelete
const testSubscribe = { url: "https://example.com/a.user.sub.js", name: "TestSubscribe", metadata: {} };
vi.mock("./SubscribeTable", () => ({
  default: (props: { handleDelete: (s: unknown) => void }) => (
    <button onClick={() => props.handleDelete(testSubscribe)}>{"trigger-delete"}</button>
  ),
}));

import SubscribeList from "./index";

beforeEach(() => {
  initLanguage("zh-CN");
  mockSubscribeData.subscribeList = [];
  mockSubscribeData.setSubscribeList = vi.fn();
  mockSubscribeData.loadingList = false;
  vi.clearAllMocks();
});

afterEach(() => cleanup());

describe("订阅列表删除二次确认", () => {
  it("点击删除应先弹出确认框，且在确认前不调用删除接口", async () => {
    render(<SubscribeList />, { wrapper: MemoryRouter });

    expect(requestDeleteSubscribe).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("trigger-delete"));

    // 弹出确认框（标题“确认删除” + 订阅删除描述），但尚未真正删除
    expect(await screen.findByText(t("confirm_delete"))).toBeTruthy();
    expect(screen.getByText(t("script:confirm_delete_subscription"))).toBeTruthy();
    expect(requestDeleteSubscribe).not.toHaveBeenCalled();
  });

  it("点击确认按钮后才真正调用删除接口（以 url 为键）", async () => {
    render(<SubscribeList />, { wrapper: MemoryRouter });
    fireEvent.click(screen.getByText("trigger-delete"));
    await screen.findByText(t("confirm_delete"));

    fireEvent.click(screen.getByRole("button", { name: t("delete") }));

    await waitFor(() => expect(requestDeleteSubscribe).toHaveBeenCalledWith("https://example.com/a.user.sub.js"));
  });

  it("点击取消按钮不应调用删除接口", async () => {
    render(<SubscribeList />, { wrapper: MemoryRouter });
    fireEvent.click(screen.getByText("trigger-delete"));
    await screen.findByText(t("confirm_delete"));

    fireEvent.click(screen.getByRole("button", { name: t("editor:cancel") }));

    await waitFor(() => expect(screen.queryByText(t("confirm_delete"))).toBeNull());
    expect(requestDeleteSubscribe).not.toHaveBeenCalled();
  });
});
