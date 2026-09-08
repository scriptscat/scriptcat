import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { InstallLayout } from "./InstallLayout";

afterEach(cleanup);

describe("InstallLayout 安装页外壳", () => {
  it("渲染品牌标识、上下文标题与内容", () => {
    render(
      <InstallLayout title="脚本安装" actions={<button>{"install"}</button>}>
        <div>{"正文内容"}</div>
      </InstallLayout>
    );
    expect(screen.getByText("ScriptCat")).toBeInTheDocument();
    expect(screen.getByText("脚本安装")).toBeInTheDocument();
    expect(screen.getByText("正文内容")).toBeInTheDocument();
  });

  it("左上角应渲染真实 logo 图片(而非占位圆点)", () => {
    render(
      <InstallLayout title="脚本安装" actions={<button>{"install"}</button>}>
        <div>{"x"}</div>
      </InstallLayout>
    );
    const logo = screen.getByAltText("ScriptCat");
    expect(logo.tagName).toBe("IMG");
    expect(logo.getAttribute("src")).toContain("assets/logo.png");
  });

  it("在吸底操作栏渲染 actions", () => {
    render(
      <InstallLayout title="脚本更新" actions={<button>{"do-update"}</button>}>
        <div>{"x"}</div>
      </InstallLayout>
    );
    const bar = screen.getByTestId("action-bar");
    expect(within(bar).getByText("do-update").closest("button")).toBeInTheDocument();
  });

  it("ribbon 挂在顶栏与滚动区之间,不随正文滚走", () => {
    render(
      <InstallLayout title="脚本安装" actions={<button>{"install"}</button>} ribbon={<div>{"成功条"}</div>}>
        <div>{"x"}</div>
      </InstallLayout>
    );
    const ribbon = screen.getByText("成功条");
    expect(ribbon).toBeInTheDocument();
    expect(within(screen.getByTestId("content-area")).queryByText("成功条")).not.toBeInTheDocument();
  });

  it("alert 渲染在吸底操作栏内、按钮行之上", () => {
    render(
      <InstallLayout title="脚本安装" actions={<button>{"install"}</button>} alert={<div>{"错误条"}</div>}>
        <div>{"x"}</div>
      </InstallLayout>
    );
    const bar = screen.getByTestId("action-bar");
    expect(within(bar).getByText("错误条")).toBeInTheDocument();
  });

  it("closing 时整页淡出,并让「减少动态效果」用户直接跳过动画", () => {
    const { rerender } = render(
      <InstallLayout title="脚本安装" actions={<button>{"install"}</button>}>
        <div>{"x"}</div>
      </InstallLayout>
    );
    const shell = screen.getByTestId("install-layout");
    expect(shell.className).not.toContain("opacity-0");

    rerender(
      <InstallLayout title="脚本安装" actions={<button>{"install"}</button>} closing>
        <div>{"x"}</div>
      </InstallLayout>
    );
    expect(shell.className).toContain("motion-safe:opacity-0");
  });
});
