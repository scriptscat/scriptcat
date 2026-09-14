import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { CompatChip } from "./CompatChip";

beforeAll(() => initTestLanguage("zh-CN"));
afterEach(cleanup);

describe("CompatChip 不生效标记", () => {
  it("渲染取值本身，并带上不生效的可读标注——含义不只靠颜色传达", () => {
    render(<CompatChip label="GM_audio" kind="grant" line={9} />);
    const chip = screen.getByTestId("compat-chip");
    expect(chip).toHaveTextContent("GM_audio");
    expect(chip).toHaveAccessibleName(expect.stringContaining("不生效"));
  });

  it("鼠标移入弹出说明：GM 能力说清调用会报错", () => {
    render(<CompatChip label="GM_audio" kind="grant" line={9} />);
    fireEvent.mouseEnter(screen.getByTestId("compat-chip"));
    expect(screen.getByText("脚本猫未实现该 API，脚本调用时会报错，依赖它的功能不可用。")).toBeInTheDocument();
  });

  it("鼠标移入弹出说明：元数据指令说清会被忽略", () => {
    render(<CompatChip label="@exclude-match" kind="metadata" line={7} />);
    fireEvent.mouseEnter(screen.getByTestId("compat-chip"));
    expect(screen.getByText("脚本猫不支持该声明，安装后会被忽略。")).toBeInTheDocument();
  });

  it("移出后收起说明", async () => {
    vi.useFakeTimers();
    try {
      render(<CompatChip label="@sandbox" kind="metadata" line={3} />);
      const chip = screen.getByTestId("compat-chip");
      fireEvent.mouseEnter(chip);
      expect(screen.getByTestId("compat-popover")).toBeInTheDocument();
      fireEvent.mouseLeave(chip);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });
      expect(screen.queryByTestId("compat-popover")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("鼠标从 chip 移到浮层上不会关闭——否则浮层里的文档链接永远点不到", async () => {
    vi.useFakeTimers();
    try {
      render(<CompatChip label="@sandbox" kind="metadata" line={3} />);
      fireEvent.mouseEnter(screen.getByTestId("compat-chip"));
      const popover = screen.getByTestId("compat-popover");
      fireEvent.mouseEnter(popover);
      fireEvent.mouseLeave(screen.getByTestId("compat-chip"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });
      expect(screen.getByTestId("compat-popover")).toBeInTheDocument();
      expect(screen.getByTestId("compat-docs")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("键盘聚焦同样弹出说明——没有鼠标也拿得到这段信息", () => {
    render(<CompatChip label="@sandbox" kind="metadata" line={3} />);
    fireEvent.focus(screen.getByTestId("compat-chip"));
    expect(screen.getByTestId("compat-popover")).toBeInTheDocument();
  });

  it("点击跳到该指令所在行", () => {
    const onJump = vi.fn();
    render(<CompatChip label="@exclude-match" kind="metadata" line={7} onJump={onJump} />);
    fireEvent.click(screen.getByTestId("compat-chip"));
    expect(onJump).toHaveBeenCalledWith(7);
  });

  it("浮层给出行号，让用户知道点下去会去哪", () => {
    render(<CompatChip label="@exclude-match" kind="metadata" line={7} onJump={vi.fn()} />);
    fireEvent.mouseEnter(screen.getByTestId("compat-chip"));
    expect(screen.getByText("跳到第 7 行")).toBeInTheDocument();
  });

  it("代码里定位不到时仍然成条，只是不可跳转", () => {
    const onJump = vi.fn();
    render(<CompatChip label="@sandbox" kind="metadata" onJump={onJump} />);
    const chip = screen.getByTestId("compat-chip");
    fireEvent.click(chip);
    expect(onJump).not.toHaveBeenCalled();
    fireEvent.mouseEnter(chip);
    expect(screen.getByTestId("compat-popover")).toBeInTheDocument();
    expect(screen.queryByText(/跳到第/)).not.toBeInTheDocument();
  });

  it("浮层提供兼容性文档链接,元数据与 GM 能力各自指向对应文档页", () => {
    const { unmount } = render(<CompatChip label="@sandbox" kind="metadata" />);
    fireEvent.mouseEnter(screen.getByTestId("compat-chip"));
    expect(screen.getByTestId("compat-docs")).toHaveAttribute("href", expect.stringContaining("/docs/dev/meta"));
    unmount();
    render(<CompatChip label="GM_audio" kind="grant" />);
    fireEvent.mouseEnter(screen.getByTestId("compat-chip"));
    expect(screen.getByTestId("compat-docs")).toHaveAttribute("href", expect.stringContaining("/docs/dev/api"));
  });
});

describe("多枚标记之间的浮层互斥", () => {
  it("悬停另一枚 chip 时上一枚的浮层立刻收起——两枚浮层会互相盖住", () => {
    render(
      <>
        <CompatChip label="@exclude-match" kind="metadata" line={7} />
        <CompatChip label="GM_audio" kind="grant" line={9} />
      </>
    );
    const [first, second] = screen.getAllByTestId("compat-chip");
    fireEvent.mouseEnter(first);
    expect(screen.getAllByTestId("compat-popover")).toHaveLength(1);
    fireEvent.mouseEnter(second);
    const open = screen.getAllByTestId("compat-popover");
    expect(open).toHaveLength(1);
    expect(open[0]).toHaveTextContent("GM_audio");
  });
});
