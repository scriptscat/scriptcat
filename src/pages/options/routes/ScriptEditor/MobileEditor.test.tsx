import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import { initLanguage } from "@App/locales/locales";
import MobileEditor from "./MobileEditor";

afterEach(cleanup);

// 移动端「更多」为非受控点按菜单：jsdom 下用键盘 Enter 展开根触发器最稳定，子菜单点按其触发器展开
const openMore = async (trigger: HTMLElement) => {
  await act(async () => {
    fireEvent.keyDown(trigger, { key: "Enter" });
  });
};
const openSub = async (subTrigger: HTMLElement) => {
  await act(async () => {
    fireEvent.click(subTrigger);
  });
};

const baseProps = () => ({
  title: "Bilibili Evolved",
  subView: "code" as const,
  onSubView: vi.fn(),
  hasActive: true,
  onBack: vi.fn(),
  onSave: vi.fn(),
  onSaveAs: vi.fn(),
  onRun: vi.fn(),
  onCommand: vi.fn(),
});

describe("MobileEditor 移动端编辑器外壳", () => {
  it("应显示脚本标题", () => {
    initLanguage("zh-CN");
    const { getByText } = render(
      <MobileEditor {...baseProps()}>
        <div>editor</div>
      </MobileEditor>
    );
    expect(getByText("Bilibili Evolved")).toBeTruthy();
  });

  it("点击返回按钮应回调 onBack", () => {
    initLanguage("zh-CN");
    const props = baseProps();
    const { getByLabelText } = render(
      <MobileEditor {...props}>
        <div />
      </MobileEditor>
    );
    fireEvent.click(getByLabelText("返回"));
    expect(props.onBack).toHaveBeenCalledOnce();
  });

  it("点击保存按钮应回调 onSave", () => {
    initLanguage("zh-CN");
    const props = baseProps();
    const { getByLabelText } = render(
      <MobileEditor {...props}>
        <div />
      </MobileEditor>
    );
    fireEvent.click(getByLabelText("保存"));
    expect(props.onSave).toHaveBeenCalledOnce();
  });

  it("点击运行应回调 onRun", () => {
    initLanguage("zh-CN");
    const props = baseProps();
    const { getByText } = render(
      <MobileEditor {...props}>
        <div />
      </MobileEditor>
    );
    fireEvent.click(getByText("运行"));
    expect(props.onRun).toHaveBeenCalledOnce();
  });

  it("点击『脚本设置』子标签应回调 onSubView('setting')", () => {
    initLanguage("zh-CN");
    const props = baseProps();
    const { getByText } = render(
      <MobileEditor {...props}>
        <div />
      </MobileEditor>
    );
    fireEvent.click(getByText("脚本设置"));
    expect(props.onSubView).toHaveBeenCalledWith("setting");
  });

  it("点击撤销应回调 onCommand('undo')", () => {
    initLanguage("zh-CN");
    const props = baseProps();
    const { getByLabelText } = render(
      <MobileEditor {...props}>
        <div />
      </MobileEditor>
    );
    fireEvent.click(getByLabelText("撤销"));
    expect(props.onCommand).toHaveBeenCalledWith("undo");
  });

  it("代码子视图下应显示底部运行工具栏（运行/撤销/重做/查找）", () => {
    initLanguage("zh-CN");
    const { getByText, getByLabelText } = render(
      <MobileEditor {...baseProps()} subView="code">
        <div />
      </MobileEditor>
    );
    expect(getByText("运行")).toBeInTheDocument();
    expect(getByLabelText("撤销")).toBeInTheDocument();
    expect(getByLabelText("重做")).toBeInTheDocument();
    expect(getByLabelText("查找")).toBeInTheDocument();
  });

  it("非代码子视图（储存）下应隐藏底部运行工具栏", () => {
    initLanguage("zh-CN");
    const { queryByText, queryByLabelText } = render(
      <MobileEditor {...baseProps()} subView="storage">
        <div />
      </MobileEditor>
    );
    // 底部工具栏整体在非代码视图下不渲染：运行/撤销/重做/查找 均不应出现
    expect(queryByText("运行")).toBeNull();
    expect(queryByLabelText("撤销")).toBeNull();
    expect(queryByLabelText("重做")).toBeNull();
    expect(queryByLabelText("查找")).toBeNull();
  });
});

describe("MobileEditor 更多菜单（与桌面端共用同一份二级菜单）", () => {
  it("展开后应是 文件/编辑/运行 二级分组 + 设置 一级项", async () => {
    initLanguage("zh-CN");
    const { getByLabelText, getByRole } = render(
      <MobileEditor {...baseProps()}>
        <div />
      </MobileEditor>
    );
    await openMore(getByLabelText("更多"));
    for (const name of ["文件", "编辑", "运行", "设置"]) {
      expect(getByRole("menuitem", { name })).toBeInTheDocument();
    }
  });

  it("编辑子菜单应包含完整命令：剪切/复制/粘贴/替换/全选/格式化", async () => {
    initLanguage("zh-CN");
    const { getByLabelText, getByText, getByRole } = render(
      <MobileEditor {...baseProps()}>
        <div />
      </MobileEditor>
    );
    await openMore(getByLabelText("更多"));
    await openSub(getByText("编辑"));
    for (const name of ["剪切", "复制", "粘贴", "替换", "全选", "格式化"]) {
      expect(getByRole("menuitem", { name: new RegExp(name) })).toBeInTheDocument();
    }
  });

  it("编辑 → 格式化 应回调 onCommand('format')", async () => {
    initLanguage("zh-CN");
    const props = baseProps();
    const { getByLabelText, getByText, getByRole } = render(
      <MobileEditor {...props}>
        <div />
      </MobileEditor>
    );
    await openMore(getByLabelText("更多"));
    await openSub(getByText("编辑"));
    fireEvent.click(getByRole("menuitem", { name: /格式化/ }));
    expect(props.onCommand).toHaveBeenCalledWith("format");
  });

  it("设置 作为一级项应回调 onSubView('setting')", async () => {
    initLanguage("zh-CN");
    const props = baseProps();
    const { getByLabelText, getByRole } = render(
      <MobileEditor {...props}>
        <div />
      </MobileEditor>
    );
    await openMore(getByLabelText("更多"));
    fireEvent.click(getByRole("menuitem", { name: "设置" }));
    expect(props.onSubView).toHaveBeenCalledWith("setting");
  });
});
