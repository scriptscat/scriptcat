// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { InstallLayout } from "./InstallLayout";

afterEach(cleanup);

describe("InstallLayout 安装页外壳", () => {
  it("渲染品牌标识、上下文标题与内容", () => {
    render(
      <InstallLayout title="脚本安装" actions={<button>install</button>}>
        <div>正文内容</div>
      </InstallLayout>
    );
    expect(screen.getByText("ScriptCat")).toBeInTheDocument();
    expect(screen.getByText("脚本安装")).toBeInTheDocument();
    expect(screen.getByText("正文内容")).toBeInTheDocument();
  });

  it("在吸底操作栏渲染 actions", () => {
    render(
      <InstallLayout title="脚本更新" actions={<button>do-update</button>}>
        <div>x</div>
      </InstallLayout>
    );
    const bar = screen.getByTestId("action-bar");
    expect(within(bar).getByRole("button", { name: "do-update" })).toBeInTheDocument();
  });

  it("顶栏与底栏使用 bg-card,与 bg-background 内容区形成对比(对照设计稿)", () => {
    render(
      <InstallLayout title="脚本安装" actions={<button>install</button>}>
        <div>x</div>
      </InstallLayout>
    );
    // 设计稿:TopBar/ActionBar 填充 #ffffff/#151515 = bg-card;ContentArea 填充 #fafafa/#1e1e1e = bg-background
    expect(screen.getByTestId("install-top-bar").className).toContain("bg-card");
    expect(screen.getByTestId("action-bar").className).toContain("bg-card");
    expect(screen.getByTestId("install-layout").className).toContain("bg-background");
  });
});
