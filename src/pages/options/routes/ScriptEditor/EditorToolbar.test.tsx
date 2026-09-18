import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import EditorToolbar from "./EditorToolbar";

beforeAll(() => initTestLanguage("zh-CN"));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const baseProps = () => ({
  subView: "code" as const,
  onSubView: vi.fn(),
  hasActive: true,
  canRun: true,
  onSave: vi.fn(),
  onSaveAs: vi.fn(),
  onRun: vi.fn(),
  onCommand: vi.fn(),
  onPreloadSubView: vi.fn(),
  scriptListCollapsed: false,
  onToggleScriptList: vi.fn(),
});

// 根菜单经 useHoverMenu 以 hover 展开；子菜单在 DOM 测试环境中以点击子触发器展开
const openRoot = async (el: HTMLElement) => {
  await act(async () => {
    fireEvent.mouseEnter(el);
  });
};
const openSub = async (el: HTMLElement) => {
  await act(async () => {
    fireEvent.click(el);
  });
};

describe("EditorToolbar 桌面端编辑器工具栏", () => {
  it("文件 → 保存 应回调 onSave", async () => {
    const props = baseProps();
    const { getByLabelText, getByText } = render(<EditorToolbar {...props} />);
    await openRoot(getByLabelText("更多"));
    await openSub(getByText("文件"));
    fireEvent.click(getByText("保存").closest('[role="menuitem"]')!);
    expect(props.onSave).toHaveBeenCalledOnce();
  });

  it("文件 → 另存为 应回调 onSaveAs", async () => {
    const props = baseProps();
    const { getByLabelText, getByText } = render(<EditorToolbar {...props} />);
    await openRoot(getByLabelText("更多"));
    await openSub(getByText("文件"));
    fireEvent.click(getByText("另存为").closest('[role="menuitem"]')!);
    expect(props.onSaveAs).toHaveBeenCalledOnce();
  });

  it("编辑 → 撤销 应回调 onCommand('undo')", async () => {
    const props = baseProps();
    const { getByLabelText, getByText } = render(<EditorToolbar {...props} />);
    await openRoot(getByLabelText("更多"));
    await openSub(getByText("编辑"));
    fireEvent.click(getByText("撤销").closest('[role="menuitem"]')!);
    expect(props.onCommand).toHaveBeenCalledWith("undo");
  });

  it("编辑 → 格式化 应回调 onCommand('format')", async () => {
    const props = baseProps();
    const { getByLabelText, getByText } = render(<EditorToolbar {...props} />);
    await openRoot(getByLabelText("更多"));
    await openSub(getByText("编辑"));
    fireEvent.click(getByText("格式化").closest('[role="menuitem"]')!);
    expect(props.onCommand).toHaveBeenCalledWith("format");
  });

  it("运行 → 运行 应回调 onRun", async () => {
    const props = baseProps();
    const { getByLabelText, getByText } = render(<EditorToolbar {...props} />);
    await openRoot(getByLabelText("更多"));
    await openSub(getByText("运行"));
    // 子触发器与运行项同名「运行」，用快捷键文本定位二级菜单里的运行项
    fireEvent.click(getByText("Ctrl+F5").closest('[role="menuitem"]')!);
    expect(props.onRun).toHaveBeenCalledOnce();
  });

  it("普通脚本（canRun=false）时应隐藏「运行」二级分组", async () => {
    const { getByLabelText, queryByText } = render(<EditorToolbar {...baseProps()} canRun={false} />);
    await openRoot(getByLabelText("更多"));
    // 仅普通脚本不可运行，「运行」分组整体不应出现；文件/编辑仍在
    expect(queryByText("文件")).toBeInTheDocument();
    expect(queryByText("编辑")).toBeInTheDocument();
    expect(queryByText("运行")).toBeNull();
  });

  it("编辑 → 剪切/复制/粘贴/全选 应展示对应快捷键", async () => {
    const { getByLabelText, getByText } = render(<EditorToolbar {...baseProps()} />);
    await openRoot(getByLabelText("更多"));
    await openSub(getByText("编辑"));
    // 测试环境判定为非 Mac，应以 Ctrl 形式展示
    expect(getByText("Ctrl+X")).toBeInTheDocument();
    expect(getByText("Ctrl+C")).toBeInTheDocument();
    expect(getByText("Ctrl+V")).toBeInTheDocument();
    expect(getByText("Ctrl+A")).toBeInTheDocument();
  });

  it("替换在 Windows 下应展示 Ctrl+H", async () => {
    const { getByLabelText, getByText } = render(<EditorToolbar {...baseProps()} />);
    await openRoot(getByLabelText("更多"));
    await openSub(getByText("编辑"));
    expect(getByText("Ctrl+H")).toBeInTheDocument();
  });

  it("替换在 Mac 下应展示 ⌥⌘F（与 Monaco 实际键位一致，而非 ⌘H）", async () => {
    vi.stubGlobal("navigator", { userAgentData: { platform: "macOS" }, userAgent: "" });
    const { getByLabelText, getByText, queryByText } = render(<EditorToolbar {...baseProps()} />);
    await openRoot(getByLabelText("更多"));
    await openSub(getByText("编辑"));
    expect(getByText("⌥⌘F")).toBeInTheDocument();
    expect(queryByText("⌘H")).toBeNull();
  });

  it("Mac 平台下保存快捷键应以 ⌘ 图标展示", async () => {
    vi.stubGlobal("navigator", { userAgentData: { platform: "macOS" }, userAgent: "" });
    const { getByLabelText, getByText } = render(<EditorToolbar {...baseProps()} />);
    await openRoot(getByLabelText("更多"));
    await openSub(getByText("文件"));
    expect(getByText("⌘S")).toBeInTheDocument();
    expect(getByText("⇧⌘S")).toBeInTheDocument();
  });

  it("设置 作为一级项应回调 onSubView('setting')", async () => {
    const props = baseProps();
    const { getByLabelText, getByText } = render(<EditorToolbar {...props} />);
    await openRoot(getByLabelText("更多"));
    fireEvent.click(getByText("设置"));
    expect(props.onSubView).toHaveBeenCalledWith("setting");
  });

  it("应渲染 代码/储存/资源/脚本设置 四个二级标签，且脚本设置排在资源之后", () => {
    const { getByText } = render(<EditorToolbar {...baseProps()} />);
    for (const label of ["代码", "储存", "资源", "脚本设置"]) {
      expect(getByText(label)).toBeInTheDocument();
    }
    const resource = getByText("资源");
    const setting = getByText("脚本设置");
    // 脚本设置 应排在 资源 之后（DOM 顺序）

    expect(resource.compareDocumentPosition(setting) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("点击 储存 标签应回调 onSubView('storage')", () => {
    const props = baseProps();
    const { getByText } = render(<EditorToolbar {...props} />);
    fireEvent.click(getByText("储存"));
    expect(props.onSubView).toHaveBeenCalledWith("storage");
  });

  it("悬浮或聚焦延迟子视图时应提前请求预加载", () => {
    const props = baseProps();
    const { getByText } = render(<EditorToolbar {...props} />);

    fireEvent.pointerEnter(getByText("储存"));
    fireEvent.focus(getByText("脚本设置"));

    expect(props.onPreloadSubView).toHaveBeenCalledWith("storage");
    expect(props.onPreloadSubView).toHaveBeenCalledWith("setting");
  });

  it("点击 资源 标签应回调 onSubView('resource')", () => {
    const props = baseProps();
    const { getByText } = render(<EditorToolbar {...props} />);
    fireEvent.click(getByText("资源"));
    expect(props.onSubView).toHaveBeenCalledWith("resource");
  });

  it("无激活脚本时菜单入口应禁用", () => {
    const { getByLabelText } = render(<EditorToolbar {...baseProps()} hasActive={false} />);
    expect(getByLabelText("更多")).toBeDisabled();
  });

  // 折叠列表是低频动作，不值得占工具栏常驻位置；入口收敛到「视图」菜单项 + ⌘B，
  // 与本项目其余快捷键「只在 ☰ 菜单露出」的惯例一致。
  it("工具栏不应有折叠按钮：入口只在视图菜单与快捷键", () => {
    const { queryByLabelText, getByLabelText } = render(<EditorToolbar {...baseProps()} />);
    expect(queryByLabelText("隐藏脚本列表")).toBeNull();
    expect(queryByLabelText("显示脚本列表")).toBeNull();
    // 工具栏首个元素回归为 ☰ 菜单入口
    expect(getByLabelText("更多").parentElement!.firstElementChild).toBe(getByLabelText("更多"));
  });

  it("列表折叠时同样不渲染折叠按钮", () => {
    const { queryByLabelText, container } = render(<EditorToolbar {...baseProps()} scriptListCollapsed={true} />);
    expect(queryByLabelText("显示脚本列表")).toBeNull();
    expect(container.querySelector(".lucide-panel-left-open")).toBeNull();
    expect(container.querySelector(".lucide-panel-left-close")).toBeNull();
  });

  it("Ctrl+B 应切换脚本列表，并阻止浏览器默认行为", () => {
    const props = baseProps();
    render(<EditorToolbar {...props} />);
    // dispatchEvent 返回 false 表示事件已被 preventDefault
    expect(fireEvent.keyDown(window, { key: "b", ctrlKey: true })).toBe(false);
    expect(props.onToggleScriptList).toHaveBeenCalledOnce();
  });

  it("按住 Ctrl+B 时重复的 keydown 不应重复切换脚本列表", () => {
    const props = baseProps();
    render(<EditorToolbar {...props} />);
    fireEvent.keyDown(window, { key: "b", ctrlKey: true, repeat: false });
    fireEvent.keyDown(window, { key: "b", ctrlKey: true, repeat: true });
    expect(props.onToggleScriptList).toHaveBeenCalledOnce();
  });

  it("Mac 下应认 ⌘B 而非 ⌃B（⌃B 在 macOS 文本编辑中是光标左移）", () => {
    vi.stubGlobal("navigator", { userAgentData: { platform: "macOS" }, userAgent: "" });
    const props = baseProps();
    render(<EditorToolbar {...props} />);
    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    expect(props.onToggleScriptList).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "b", metaKey: true });
    expect(props.onToggleScriptList).toHaveBeenCalledOnce();
  });

  it("非拉丁键盘布局下按物理 B 键仍应生效（俄文布局 e.key 是「и」）", () => {
    const props = baseProps();
    render(<EditorToolbar {...props} />);
    fireEvent.keyDown(window, { key: "и", code: "KeyB", ctrlKey: true });
    expect(props.onToggleScriptList).toHaveBeenCalledOnce();
  });

  it("按键位重映射（Dvorak）时按标着 B 的键也应生效", () => {
    const props = baseProps();
    render(<EditorToolbar {...props} />);
    fireEvent.keyDown(window, { key: "b", code: "KeyN", ctrlKey: true });
    expect(props.onToggleScriptList).toHaveBeenCalledOnce();
  });

  it("单独 B 或带 Shift/Alt 的组合不应触发切换", () => {
    const props = baseProps();
    render(<EditorToolbar {...props} />);
    fireEvent.keyDown(window, { key: "b" });
    fireEvent.keyDown(window, { key: "b", ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: "b", ctrlKey: true, altKey: true });
    expect(props.onToggleScriptList).not.toHaveBeenCalled();
  });

  it("输入框聚焦时快捷键仍应生效（全局面板开关）", () => {
    const props = baseProps();
    const { getByLabelText } = render(
      <>
        <input aria-label="搜索" />
        <EditorToolbar {...props} />
      </>
    );
    const input = getByLabelText("搜索");
    input.focus();
    fireEvent.keyDown(input, { key: "b", ctrlKey: true });
    expect(props.onToggleScriptList).toHaveBeenCalledOnce();
  });

  it("卸载后不应再响应快捷键", () => {
    const props = baseProps();
    const { unmount } = render(<EditorToolbar {...props} />);
    unmount();
    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    expect(props.onToggleScriptList).not.toHaveBeenCalled();
  });

  it("视图 → 隐藏脚本列表 应回调 onToggleScriptList 并标出快捷键", async () => {
    const props = baseProps();
    const { getByLabelText, getByText } = render(<EditorToolbar {...props} />);
    await openRoot(getByLabelText("更多"));
    await openSub(getByText("视图"));
    const item = getByText("隐藏脚本列表").closest('[role="menuitem"]')!;
    // 与其余命令一致：快捷键跟在菜单项右侧，而不是浮在工具栏上
    expect(item.textContent).toContain("Ctrl+B");
    fireEvent.click(item);
    expect(props.onToggleScriptList).toHaveBeenCalledOnce();
  });

  it("列表已收起时视图项应显示「显示脚本列表」", async () => {
    const props = { ...baseProps(), scriptListCollapsed: true };
    const { getByLabelText, getByText } = render(<EditorToolbar {...props} />);
    await openRoot(getByLabelText("更多"));
    await openSub(getByText("视图"));
    expect(getByText("显示脚本列表").closest('[role="menuitem"]')).toBeTruthy();
  });

  it("工具栏不应有常驻快捷键标签：Mac(⌘B)/Windows(Ctrl+B) 宽度不一，且提示归菜单", () => {
    const { queryByText } = render(<EditorToolbar {...baseProps()} />);
    expect(queryByText("Ctrl+B")).toBeNull();
    expect(queryByText("⌘B")).toBeNull();
  });

  it("Mac 下视图菜单项的快捷键应显示为 ⌘B", async () => {
    vi.stubGlobal("navigator", { userAgentData: { platform: "macOS" }, userAgent: "" });
    const { getByLabelText, getByText } = render(<EditorToolbar {...baseProps()} />);
    await openRoot(getByLabelText("更多"));
    await openSub(getByText("视图"));
    const item = getByText("隐藏脚本列表").closest('[role="menuitem"]')!;
    expect(item.textContent).toContain("⌘B");
    expect(item.textContent).not.toContain("Ctrl");
  });
});
