import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderHook, act } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { t } from "@App/locales/locales";
import {
  MobileActionSheet,
  MobileActionSheetItem,
  MobileBatchBar,
  MobileBatchBarButton,
  MobileListRow,
  MobileListRowLeading,
  MobileListRowMain,
  MobileListRowTrailing,
  MobileSelectionHeader,
  MobileSwipeRow,
  useLongPress,
} from "./mobile-list";

beforeAll(() => initTestLanguage("zh-CN"));
afterEach(cleanup);

// useLongPress 只读 touches[0] 的坐标，构造最小事件即可
const touchEvent = (clientX: number, clientY: number) =>
  ({ touches: [{ clientX, clientY }] }) as unknown as React.TouchEvent<HTMLElement>;

describe("移动端列表行骨架", () => {
  it("四个槽位各自可辨识，行只固化几何与状态、不认业务字段", () => {
    const { container } = render(
      <MobileListRow selected>
        <MobileListRowLeading>{"L"}</MobileListRowLeading>
        <MobileListRowMain>{"M"}</MobileListRowMain>
        <MobileListRowTrailing>{"T"}</MobileListRowTrailing>
      </MobileListRow>
    );

    expect(container.querySelector('[data-slot="mobile-list-row"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="mobile-list-row-leading"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="mobile-list-row-main"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="mobile-list-row-trailing"]')).not.toBeNull();
  });

  it("主体区是可聚焦按钮，右锚区的开关不落在它内部（点开关不会误开操作面板）", () => {
    const onTap = vi.fn();
    render(
      <MobileListRow>
        <MobileListRowMain onClick={onTap}>{"名称"}</MobileListRowMain>
        <MobileListRowTrailing>
          <button type="button">{"开关"}</button>
        </MobileListRowTrailing>
      </MobileListRow>
    );

    const main = screen.getByRole("button", { name: "名称" });
    expect(main.tagName).toBe("BUTTON");
    expect(main.querySelector("button")).toBeNull();

    fireEvent.click(main);
    expect(onTap).toHaveBeenCalledTimes(1);
  });
});

describe("左滑操作", () => {
  // 开合受控于列表（同时只允许一行滑开），测试里用最小受控外壳承接
  const ControlledSwipe = ({ onRowClick }: { onRowClick?: () => void }) => {
    const [open, setOpen] = useState(false);
    return (
      <MobileSwipeRow open={open} onOpenChange={setOpen} actions={<button type="button">{"删除"}</button>}>
        <MobileListRow onClick={onRowClick}>{"行"}</MobileListRow>
      </MobileSwipeRow>
    );
  };

  const renderSwipe = () => render(<ControlledSwipe />);

  const swipe = (from: number, to: number) => {
    const row = document.querySelector('[data-slot="mobile-swipe-row"]')!;
    fireEvent.touchStart(row, { touches: [{ clientX: from }] });
    fireEvent.touchEnd(row, { changedTouches: [{ clientX: to }] });
  };

  it("左滑露出操作区", () => {
    const { container } = renderSwipe();
    expect(container.querySelector('[data-slot="mobile-swipe-actions"]')).toHaveAttribute("data-state", "closed");

    swipe(200, 120);

    expect(container.querySelector('[data-slot="mobile-swipe-actions"]')).toHaveAttribute("data-state", "open");
  });

  it("右滑收起操作区", () => {
    const { container } = renderSwipe();
    swipe(200, 120);

    swipe(120, 200);

    expect(container.querySelector('[data-slot="mobile-swipe-actions"]')).toHaveAttribute("data-state", "closed");
  });

  it("轻微位移不触发滑动，避免点击被误判为左滑", () => {
    const { container } = renderSwipe();

    swipe(200, 190);

    expect(container.querySelector('[data-slot="mobile-swipe-actions"]')).toHaveAttribute("data-state", "closed");
  });

  it("已滑开时点内容层是收起，不透传为行点击（与移动端通行心智一致，也避免误触）", () => {
    const onRowClick = vi.fn();
    const { container } = render(<ControlledSwipe onRowClick={onRowClick} />);
    swipe(200, 120);
    expect(container.querySelector('[data-slot="mobile-swipe-actions"]')).toHaveAttribute("data-state", "open");

    fireEvent.click(container.querySelector('[data-slot="mobile-swipe-content"]')!);

    expect(container.querySelector('[data-slot="mobile-swipe-actions"]')).toHaveAttribute("data-state", "closed");
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("关闭态操作区置为 inert，键盘不会聚焦到不播报的破坏性按钮", () => {
    const { container } = renderSwipe();
    const actions = container.querySelector('[data-slot="mobile-swipe-actions"]')!;
    expect(actions).toHaveAttribute("inert");

    swipe(200, 120);

    expect(container.querySelector('[data-slot="mobile-swipe-actions"]')).not.toHaveAttribute("inert");
  });

  it("内容位移取操作区实际宽度，操作块数量不同的页面不会滑出空白", () => {
    const { container } = render(<ControlledSwipe />);
    const actions = container.querySelector('[data-slot="mobile-swipe-actions"]') as HTMLElement;
    Object.defineProperty(actions, "offsetWidth", { configurable: true, value: 64 });

    swipe(200, 120);

    expect(container.querySelector('[data-slot="mobile-swipe-content"]')).toHaveStyle({
      transform: "translateX(-64px)",
    });
  });

  it("关闭态操作区被内容层盖住，不会漏在行右侧遮挡开关", () => {
    const { container } = render(
      <MobileSwipeRow open={false} onOpenChange={vi.fn()} actions={<button type="button">{"删除"}</button>}>
        <MobileListRow>{"行"}</MobileListRow>
      </MobileSwipeRow>
    );

    // 操作区是 absolute，内容层必须自己定位才能盖住它（普通流元素会被 absolute 元素压住）
    const content = container.querySelector('[data-slot="mobile-swipe-content"]')!;
    expect(content.className).toContain("relative");
    expect(content.className).toContain("bg-background");
  });

  it("透传的触摸回调仍然被调用，长按与左滑可挂在同一行上", () => {
    const onTouchStart = vi.fn();
    const { container } = render(
      <MobileSwipeRow open={false} onOpenChange={vi.fn()} actions={null} onTouchStart={onTouchStart}>
        <MobileListRow>{"行"}</MobileListRow>
      </MobileSwipeRow>
    );

    fireEvent.touchStart(container.querySelector('[data-slot="mobile-swipe-row"]')!, { touches: [{ clientX: 10 }] });

    expect(onTouchStart).toHaveBeenCalledTimes(1);
  });
});

describe("长按", () => {
  it("按住超过时延触发回调", () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress, 500));

    act(() => result.current.onTouchStart(touchEvent(100, 100)));
    act(() => void vi.advanceTimersByTime(500));

    expect(onLongPress).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("按住时手指轻微抖动不取消长按", () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => result.current.onTouchStart(touchEvent(100, 100)));
    act(() => result.current.onTouchMove(touchEvent(104, 103)));
    act(() => vi.advanceTimersByTime(600));

    expect(onLongPress).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("按住时手指明显移动则取消长按，避免与滑动/拖拽抢手势", () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => result.current.onTouchStart(touchEvent(100, 100)));
    act(() => result.current.onTouchMove(touchEvent(140, 100)));
    act(() => vi.advanceTimersByTime(600));

    expect(onLongPress).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("提前松手不触发回调", () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress, 500));

    act(() => result.current.onTouchStart(touchEvent(100, 100)));
    act(() => void vi.advanceTimersByTime(200));
    act(() => result.current.onTouchEnd());
    act(() => void vi.advanceTimersByTime(500));

    expect(onLongPress).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("选择模式外壳", () => {
  it("顶栏显示已选数量，并提供取消与全选", () => {
    const onCancel = vi.fn();
    const onToggleSelectAll = vi.fn();
    render(
      <MobileSelectionHeader
        selectedCount={2}
        allSelected={false}
        onCancel={onCancel}
        onToggleSelectAll={onToggleSelectAll}
      />
    );

    expect(screen.getByText(t("batch_selected", { count: 2 }))).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(t("editor:cancel")));
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText(t("script:select_all")));
    expect(onToggleSelectAll).toHaveBeenCalledTimes(1);
  });

  it("底部批量操作条渲染各页自定的动作", () => {
    const onDelete = vi.fn();
    render(
      <MobileBatchBar>
        <MobileBatchBarButton onClick={onDelete} destructive>
          {t("delete")}
        </MobileBatchBarButton>
      </MobileBatchBar>
    );

    fireEvent.click(screen.getByText(t("delete")));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

describe("底部操作面板", () => {
  it("打开时展示标题与各项动作，点击后回调并请求关闭", () => {
    const onOpenChange = vi.fn();
    const onSelect = vi.fn();
    render(
      <MobileActionSheet open onOpenChange={onOpenChange} title="示例脚本" description="1.0.0">
        <MobileActionSheetItem onSelect={onSelect}>{t("edit")}</MobileActionSheetItem>
      </MobileActionSheet>
    );

    expect(screen.getByText("示例脚本")).toBeInTheDocument();
    expect(screen.getByText("1.0.0")).toBeInTheDocument();

    fireEvent.click(screen.getByText(t("edit")));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
