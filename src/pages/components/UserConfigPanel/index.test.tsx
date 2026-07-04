import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { t } from "@App/locales/locales";
import { initTestLanguage } from "@Tests/initTestLanguage";

const { setScriptValues } = vi.hoisted(() => ({ setScriptValues: vi.fn() }));
vi.mock("@App/pages/store/features/script", () => ({
  valueClient: { setScriptValues },
}));
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

import UserConfigPanel, { resolveConfigType } from "./index";

const base = { title: "", description: "", index: 0 };

describe("用户配置项类型推断 resolveConfigType", () => {
  it("显式 type 优先", () => {
    expect(resolveConfigType({ ...base, type: "select", values: [] })).toBe("select");
    expect(resolveConfigType({ ...base, type: "textarea" })).toBe("textarea");
  });

  it("default 为布尔时推断为 checkbox", () => {
    expect(resolveConfigType({ ...base, default: true })).toBe("checkbox");
  });

  it("default 为数字时推断为 number", () => {
    expect(resolveConfigType({ ...base, default: 5 })).toBe("number");
  });

  it("无 type/values/default 时回退为 text", () => {
    expect(resolveConfigType({ ...base })).toBe("text");
    expect(resolveConfigType({ ...base, default: "abc" })).toBe("text");
  });
});

const script = { uuid: "u1", name: "夜间模式增强" } as never;
const userConfig = {
  "#options": { sort: ["基本设置", "通知"] },
  基本设置: {
    apiUrl: { title: "API 地址", type: "text", default: "" },
  },
  通知: {
    enabled: { title: "启用", type: "switch", default: false },
  },
} as never;
const values = { "基本设置.apiUrl": "https://api.example.com" };

const renderPanel = (onOpenChange = vi.fn()) => {
  render(<UserConfigPanel open onOpenChange={onOpenChange} script={script} userConfig={userConfig} values={values} />);
  return onOpenChange;
};

beforeAll(() => initTestLanguage("zh-CN"));

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("UserConfigPanel 用户配置面板（对齐设计稿）", () => {
  it("标题区为脚本名 + 「用户配置」副标题（堆叠展示）", () => {
    renderPanel();
    expect(screen.getByText("夜间模式增强")).toBeInTheDocument();
    expect(screen.getByText(t("editor:user_config"))).toBeInTheDocument();
  });

  it("渲染分组 Tab 与配置项标题", () => {
    renderPanel();
    expect(screen.getByRole("tab", { name: "基本设置" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "通知" })).toBeInTheDocument();
    expect(screen.getByText("API 地址")).toBeInTheDocument();
  });

  it("底部按钮为「取消 / 保存」，取消仅关闭、不写值", () => {
    const onOpenChange = renderPanel();
    expect(screen.getByRole("button", { name: t("save") })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t("editor:cancel") }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(setScriptValues).not.toHaveBeenCalled();
  });

  it("保存写入当前分组的值并关闭", () => {
    const onOpenChange = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: t("save") }));
    expect(setScriptValues).toHaveBeenCalledTimes(1);
    expect(setScriptValues.mock.calls[0][0]).toMatchObject({ uuid: "u1", isReplace: false });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
