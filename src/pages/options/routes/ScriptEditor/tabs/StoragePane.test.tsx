// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { initLanguage, t } from "@App/locales/locales";

// 储存数据走后台消息，统一打桩；用 hoisted 以便在 vi.mock 工厂内引用
const { fetchScript, getScriptValue, setScriptValue, setScriptValues } = vi.hoisted(() => ({
  fetchScript: vi.fn(),
  getScriptValue: vi.fn(),
  setScriptValue: vi.fn(),
  setScriptValues: vi.fn(),
}));
vi.mock("@App/pages/store/features/script", () => ({
  fetchScript,
  valueClient: { getScriptValue, setScriptValue, setScriptValues },
}));

import StoragePane, { invalidateStoragePane, preloadStoragePane } from "./StoragePane";

const sampleValues = () => ({ token: "abc", count: 42, enabled: true, config: { a: 1 } });

beforeEach(() => {
  initLanguage("zh-CN");
  vi.clearAllMocks();
  fetchScript.mockResolvedValue({ uuid: "u1", name: "脚本A" });
  getScriptValue.mockResolvedValue(sampleValues());
  setScriptValue.mockResolvedValue(undefined);
  setScriptValues.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  invalidateStoragePane();
});

describe("StoragePane 储存面板", () => {
  it("预加载后挂载应复用同一份储存数据", async () => {
    await preloadStoragePane("u1");
    render(<StoragePane uuid="u1" />);

    expect(screen.getByText("token")).toBeInTheDocument();
    expect(fetchScript).toHaveBeenCalledOnce();
    expect(getScriptValue).toHaveBeenCalledOnce();
  });

  it("卸载后应清除缓存以避免复用外部脚本修改前的数据", async () => {
    const first = render(<StoragePane uuid="u1" />);
    await screen.findByText("token");
    first.unmount();
    getScriptValue.mockResolvedValue({});

    render(<StoragePane uuid="u1" />);

    expect(await screen.findByText(t("no_data"))).toBeInTheDocument();
    expect(getScriptValue).toHaveBeenCalledTimes(2);
  });

  it("应加载并展示 key / value / 类型", async () => {
    render(<StoragePane uuid="u1" />);
    expect(await screen.findByText("token")).toBeInTheDocument();
    expect(screen.getByText("count")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    // 类型列：每个值类型各一次
    expect(screen.getByText("number")).toBeInTheDocument();
    expect(screen.getByText("boolean")).toBeInTheDocument();
    expect(screen.getByText("object")).toBeInTheDocument();
  });

  it("类型徽章应按值类型着色（string/number/boolean/object 各异）", async () => {
    render(<StoragePane uuid="u1" />);
    await screen.findByText("token");
    // 每种值类型对应设计稿独立的胶囊配色令牌
    expect(screen.getByText("string")).toHaveClass("text-type-string-fg");
    expect(screen.getByText("number")).toHaveClass("text-type-number-fg");
    expect(screen.getByText("boolean")).toHaveClass("text-type-boolean-fg");
    expect(screen.getByText("object")).toHaveClass("text-type-object-fg");
  });

  it("删除应以 undefined 调用 setScriptValue 并移除该行", async () => {
    render(<StoragePane uuid="u1" />);
    await screen.findByText("token");
    fireEvent.click(screen.getAllByRole("button", { name: t("delete") })[0]);
    await waitFor(() =>
      expect(setScriptValue).toHaveBeenCalledWith(expect.objectContaining({ key: "token", value: undefined }))
    );
    await waitFor(() => expect(screen.queryByText("token")).toBeNull());
  });

  it("添加：填写 key/value 后保存应调用 setScriptValue 并新增行", async () => {
    render(<StoragePane uuid="u1" />);
    await screen.findByText("token");
    fireEvent.click(screen.getByRole("button", { name: t("add") }));
    fireEvent.change(screen.getByPlaceholderText(t("editor:key_placeholder")), { target: { value: "newKey" } });
    fireEvent.change(screen.getByPlaceholderText(t("editor:value_placeholder")), { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: t("save") }));
    await waitFor(() =>
      expect(setScriptValue).toHaveBeenCalledWith(expect.objectContaining({ key: "newKey", value: "hello" }))
    );
    expect(await screen.findByText("newKey")).toBeInTheDocument();
  });

  it("编辑数字类型：保存应把字符串转换为 number 再 setScriptValue", async () => {
    render(<StoragePane uuid="u1" />);
    await screen.findByText("count");
    // count 行的编辑按钮（第二行）
    fireEvent.click(screen.getAllByRole("button", { name: t("edit") })[1]);
    const valueBox = screen.getByPlaceholderText(t("editor:value_placeholder"));
    fireEvent.change(valueBox, { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: t("save") }));
    await waitFor(() =>
      expect(setScriptValue).toHaveBeenCalledWith(expect.objectContaining({ key: "count", value: 100 }))
    );
  });

  it("清空应以 isReplace 空键值对调用 setScriptValues 并清空列表", async () => {
    render(<StoragePane uuid="u1" />);
    await screen.findByText("token");
    fireEvent.click(screen.getByRole("button", { name: new RegExp(t("clear")) }));
    fireEvent.click(screen.getByRole("button", { name: t("confirm") }));
    await waitFor(() =>
      expect(setScriptValues).toHaveBeenCalledWith(expect.objectContaining({ isReplace: true, keyValuePairs: [] }))
    );
    await waitFor(() => expect(screen.getByText(t("no_data"))).toBeInTheDocument());
  });

  it("批量编辑：进入 JSON 模式展示数据，保存以 isReplace 调用 setScriptValues", async () => {
    render(<StoragePane uuid="u1" />);
    await screen.findByText("token");
    fireEvent.click(screen.getByRole("button", { name: t("editor:batch_edit") }));
    const textarea = screen.getByRole("textbox");
    expect((textarea as HTMLTextAreaElement).value).toContain("token");
    fireEvent.change(textarea, { target: { value: '{"onlyKey": 1}' } });
    fireEvent.click(screen.getByRole("button", { name: t("save") }));
    await waitFor(() => expect(setScriptValues).toHaveBeenCalledWith(expect.objectContaining({ isReplace: true })));
  });

  it("无数据时应展示空状态", async () => {
    getScriptValue.mockResolvedValue({});
    render(<StoragePane uuid="u1" />);
    expect(await screen.findByText(t("no_data"))).toBeInTheDocument();
  });
});
