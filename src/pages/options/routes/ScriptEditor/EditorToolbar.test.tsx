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
  onSave: vi.fn(),
  onSaveAs: vi.fn(),
  onRun: vi.fn(),
  onCommand: vi.fn(),
  onPreloadSubView: vi.fn(),
  scriptListCollapsed: false,
  onToggleScriptList: vi.fn(),
});

// 根菜单经 useHoverMenu 以 hover 展开；子菜单在 jsdom 中以点击子触发器展开
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
  it("应保留原汉堡图标按钮作为菜单入口", () => {
    const { getByLabelText } = render(<EditorToolbar {...baseProps()} />);
    expect(getByLabelText("更多")).toBeInTheDocument();
  });

  it("展开后应是「文件」「编辑」「运行」二级子菜单而非全部平铺", async () => {
    const { getByLabelText, getByText } = render(<EditorToolbar {...baseProps()} />);
    await openRoot(getByLabelText("更多"));
    // 顶层只暴露分组（子菜单触发器），具体操作收纳在二级子菜单里，默认不可见
    expect(getByText("文件")).toBeInTheDocument();
    expect(getByText("编辑")).toBeInTheDocument();
    expect(getByText("运行")).toBeInTheDocument();
  });

  it("文件 → 保存 应回调 onSave", async () => {
    const props = baseProps();
    const { getByLabelText, getByText, getByRole } = render(<EditorToolbar {...props} />);
    await openRoot(getByLabelText("更多"));
    await openSub(getByText("文件"));
    fireEvent.click(getByRole("menuitem", { name: /保存/ }));
    expect(props.onSave).toHaveBeenCalledOnce();
  });

  it("文件 → 另存为 应回调 onSaveAs", async () => {
    const props = baseProps();
    const { getByLabelText, getByText, getByRole } = render(<EditorToolbar {...props} />);
    await openRoot(getByLabelText("更多"));
    await openSub(getByText("文件"));
    fireEvent.click(getByRole("menuitem", { name: /另存为/ }));
    expect(props.onSaveAs).toHaveBeenCalledOnce();
  });

  it("编辑 → 撤销 应回调 onCommand('undo')", async () => {
    const props = baseProps();
    const { getByLabelText, getByText, getByRole } = render(<EditorToolbar {...props} />);
    await openRoot(getByLabelText("更多"));
    await openSub(getByText("编辑"));
    fireEvent.click(getByRole("menuitem", { name: /撤销/ }));
    expect(props.onCommand).toHaveBeenCalledWith("undo");
  });

  it("编辑 → 格式化 应回调 onCommand('format')", async () => {
    const props = baseProps();
    const { getByLabelText, getByText, getByRole } = render(<EditorToolbar {...props} />);
    await openRoot(getByLabelText("更多"));
    await openSub(getByText("编辑"));
    fireEvent.click(getByRole("menuitem", { name: /格式化/ }));
    expect(props.onCommand).toHaveBeenCalledWith("format");
  });

  it("运行 → 运行 应回调 onRun", async () => {
    const props = baseProps();
    const { getByLabelText, getByText, getByRole } = render(<EditorToolbar {...props} />);
    await openRoot(getByLabelText("更多"));
    await openSub(getByText("运行"));
    // 子触发器与运行项同名「运行」，用快捷键文本定位二级菜单里的运行项
    fireEvent.click(getByRole("menuitem", { name: /Ctrl\+F5/ }));
    expect(props.onRun).toHaveBeenCalledOnce();
  });

  it("编辑 → 剪切/复制/粘贴/全选 应展示对应快捷键", async () => {
    const { getByLabelText, getByText } = render(<EditorToolbar {...baseProps()} />);
    await openRoot(getByLabelText("更多"));
    await openSub(getByText("编辑"));
    // jsdom 判定为非 Mac，应以 Ctrl 形式展示
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

  it("列表显示时应渲染「隐藏脚本列表」切换按钮，点击触发 onToggleScriptList", () => {
    const props = baseProps();
    const { getByLabelText } = render(<EditorToolbar {...props} scriptListCollapsed={false} />);
    const btn = getByLabelText("隐藏脚本列表");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(props.onToggleScriptList).toHaveBeenCalledOnce();
  });

  it("列表折叠时切换按钮应变为「显示脚本列表」", () => {
    const props = baseProps();
    const { getByLabelText, queryByLabelText } = render(<EditorToolbar {...props} scriptListCollapsed={true} />);
    expect(getByLabelText("显示脚本列表")).toBeInTheDocument();
    expect(queryByLabelText("隐藏脚本列表")).toBeNull();
  });
});
