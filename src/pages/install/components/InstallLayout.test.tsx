import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, act, fireEvent } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { mockMatchMedia } from "@Tests/mockMatchMedia";
import { mockIntersectionObserver } from "@Tests/mockIntersectionObserver";
import { InstallLayout, type InstallLayoutProps } from "./InstallLayout";

let io: ReturnType<typeof mockIntersectionObserver>;

const layoutProps = (over: Partial<InstallLayoutProps> = {}): InstallLayoutProps => ({
  title: "脚本安装",
  actions: (placement) => <button data-placement={placement}>{"install"}</button>,
  summary: <span>{"迷你身份"}</span>,
  identity: (slots) => (
    <section data-testid="identity">
      {"身份卡"}
      {slots && (
        <>
          {slots.actions}
          {slots.alert}
          {slots.note}
        </>
      )}
    </section>
  ),
  children: <div>{"正文内容"}</div>,
  ...over,
});

const scrollActionsOut = () =>
  act(() => {
    io.setIntersecting(screen.getByTestId("card-actions"), false);
  });

beforeAll(() => initTestLanguage("zh-CN"));

beforeEach(() => {
  mockMatchMedia(false);
  io = mockIntersectionObserver();
});

afterEach(cleanup);

describe("InstallLayout 安装页外壳", () => {
  it("渲染品牌标识、上下文标题、身份卡与正文", () => {
    render(<InstallLayout {...layoutProps()} />);
    expect(screen.getByText("ScriptCat")).toBeInTheDocument();
    expect(screen.getByText("脚本安装")).toBeInTheDocument();
    expect(screen.getByText("身份卡")).toBeInTheDocument();
    expect(screen.getByText("正文内容")).toBeInTheDocument();
  });

  it("左上角应渲染真实 logo 图片(而非占位圆点)", () => {
    render(<InstallLayout {...layoutProps()} />);
    const logo = screen.getByAltText("ScriptCat");
    expect(logo.tagName).toBe("IMG");
    expect(logo.getAttribute("src")).toContain("assets/logo.png");
  });

  it("ribbon 挂在顶栏与滚动区之间,不随正文滚走", () => {
    render(<InstallLayout {...layoutProps({ ribbon: <div>{"成功条"}</div> })} />);
    expect(screen.getByText("成功条")).toBeInTheDocument();
    expect(within(screen.getByTestId("content-area")).queryByText("成功条")).not.toBeInTheDocument();
  });

  it("closing 时整页淡出,并让「减少动态效果」用户直接跳过动画", () => {
    const { rerender } = render(<InstallLayout {...layoutProps()} />);
    const shell = screen.getByTestId("install-layout");
    expect(shell.className).not.toContain("opacity-0");

    rerender(<InstallLayout {...layoutProps({ closing: true })} />);
    expect(shell.className).toContain("motion-safe:opacity-0");
  });
});

describe("InstallLayout 桌面端：操作组在身份卡内，滚出后吸底", () => {
  it("首屏操作组渲染在身份卡内，不渲染吸底栏", () => {
    render(<InstallLayout {...layoutProps({ note: "信任提示" })} />);
    const identity = screen.getByTestId("identity");
    expect(within(identity).getByRole("button", { name: "install" })).toHaveAttribute("data-placement", "card");
    expect(within(identity).getByText("信任提示")).toBeInTheDocument();
    expect(screen.queryByTestId("action-bar")).not.toBeInTheDocument();
  });

  it("身份卡操作组滚出可视区后出现吸底栏（迷你身份 + 操作组），滚回后移除", () => {
    render(<InstallLayout {...layoutProps()} />);
    scrollActionsOut();
    const bar = screen.getByTestId("action-bar");
    expect(within(bar).getByText("迷你身份")).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "install" })).toHaveAttribute("data-placement", "sticky");

    act(() => {
      io.setIntersecting(screen.getByTestId("card-actions"), true);
    });
    fireEvent.animationEnd(bar);
    expect(screen.queryByTestId("action-bar")).not.toBeInTheDocument();
  });

  it("吸底栏进出都有过渡：滚回时先播退出动画，吸底栏自身动画结束后才移出 DOM", () => {
    render(<InstallLayout {...layoutProps()} />);
    scrollActionsOut();
    const bar = screen.getByTestId("action-bar");
    expect(bar.className).toContain("animate-in");

    act(() => {
      io.setIntersecting(screen.getByTestId("card-actions"), true);
    });
    expect(bar).toBeInTheDocument();
    expect(bar.className).toContain("animate-out");

    // 子元素（如下拉菜单）的动画事件会冒泡上来，不能误当成吸底栏自己的退出结束
    fireEvent.animationEnd(within(bar).getByRole("button", { name: "install" }));
    expect(screen.getByTestId("action-bar")).toBe(bar);

    fireEvent.animationEnd(bar);
    expect(screen.queryByTestId("action-bar")).not.toBeInTheDocument();
  });

  it("退出动画中途再次滚出时吸底栏恢复显示，不被随后的动画结束移除", () => {
    render(<InstallLayout {...layoutProps()} />);
    scrollActionsOut();
    act(() => {
      io.setIntersecting(screen.getByTestId("card-actions"), true);
    });
    scrollActionsOut();
    const bar = screen.getByTestId("action-bar");
    expect(bar.className).not.toContain("animate-out");

    fireEvent.animationEnd(bar);
    expect(screen.getByTestId("action-bar")).toBeInTheDocument();
  });

  it("一次回调批量送达多条记录时以最后一条为准：滚出又滚回不出现吸底栏", () => {
    render(<InstallLayout {...layoutProps()} />);
    act(() => {
      io.setIntersecting(screen.getByTestId("card-actions"), [false, true]);
    });
    expect(screen.queryByTestId("action-bar")).not.toBeInTheDocument();
  });

  it("退出动画中的吸底栏不可交互、不进入无障碍树，失败条与操作只由身份卡承担", () => {
    render(<InstallLayout {...layoutProps({ failure: { message: "解析失败" } })} />);
    scrollActionsOut();
    const bar = screen.getByTestId("action-bar");
    expect(bar).not.toHaveAttribute("inert");

    act(() => {
      io.setIntersecting(screen.getByTestId("card-actions"), true);
    });
    expect(bar).toHaveAttribute("inert");
    expect(within(screen.getByTestId("identity")).getByText("解析失败")).toBeInTheDocument();
  });

  it("跨过移动断点再回到桌面时不沿用旧的滚出状态，也不补播吸底栏退出动画", () => {
    const { rerender } = render(<InstallLayout {...layoutProps()} />);
    scrollActionsOut();
    expect(screen.getByTestId("action-bar")).toBeInTheDocument();

    mockMatchMedia(true);
    rerender(<InstallLayout {...layoutProps()} />);
    mockMatchMedia(false);
    rerender(<InstallLayout {...layoutProps()} />);
    expect(screen.queryByTestId("action-bar")).not.toBeInTheDocument();
  });

  it("失败条只渲染一份，跟随当前可见的那组操作", () => {
    const onRetry = vi.fn();
    render(<InstallLayout {...layoutProps({ failure: { message: "解析失败", onRetry } })} />);
    expect(screen.getAllByTestId("install-error-bar")).toHaveLength(1);
    expect(within(screen.getByTestId("identity")).getByText("解析失败")).toBeInTheDocument();

    scrollActionsOut();
    expect(screen.getAllByTestId("install-error-bar")).toHaveLength(1);
    const bar = screen.getByTestId("action-bar");
    expect(within(bar).getByText("解析失败")).toBeInTheDocument();
    fireEvent.click(within(bar).getByTestId("install-error-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("InstallLayout 移动端保持吸底操作栏", () => {
  beforeEach(() => mockMatchMedia(true));

  it("身份卡不接收操作插槽，操作组与失败条常驻吸底栏，不渲染说明文字", () => {
    render(<InstallLayout {...layoutProps({ note: "信任提示", failure: { message: "解析失败" } })} />);
    const identity = screen.getByTestId("identity");
    expect(within(identity).queryByRole("button")).not.toBeInTheDocument();
    const bar = screen.getByTestId("action-bar");
    expect(within(bar).getByRole("button", { name: "install" })).toHaveAttribute("data-placement", "footer");
    expect(within(bar).getByText("解析失败")).toBeInTheDocument();
    expect(screen.queryByText("信任提示")).not.toBeInTheDocument();
  });
});
