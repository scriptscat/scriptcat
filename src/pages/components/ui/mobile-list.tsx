import type React from "react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@App/pkg/utils/cn";
import { Checkbox } from "./checkbox";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./sheet";

// 移动端列表行骨架。与桌面骨架刻意分家：移动端锚位是「图标在左、开关在右」，
// 还多出左滑外壳与选择模式，合并成一套就要同时认识两套相反的几何。
const mobileListRowVariants = cva("flex h-16 items-center gap-3 px-4 border-b border-border transition-colors", {
  variants: {
    selected: { true: "bg-primary/10", false: "" },
    disabled: { true: "opacity-60", false: "" },
  },
  defaultVariants: { selected: false, disabled: false },
});

type MobileListRowProps = React.ComponentProps<"div"> & VariantProps<typeof mobileListRowVariants>;

function MobileListRow({ className, selected, disabled, ...props }: MobileListRowProps) {
  return (
    <div
      data-slot="mobile-list-row"
      className={cn(mobileListRowVariants({ selected, disabled }), className)}
      {...props}
    />
  );
}

function MobileListRowLeading({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="mobile-list-row-leading" className={cn("flex shrink-0 items-center", className)} {...props} />;
}

// 主体区是真正的可点区域，做成按钮而非整行监听：开关落在右锚区、不在按钮内，
// 点开关就不会连带触发「打开操作面板」。
function MobileListRowMain({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      data-slot="mobile-list-row-main"
      className={cn("flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left", className)}
      {...props}
    />
  );
}

function MobileListRowTrailing({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="mobile-list-row-trailing"
      className={cn("flex shrink-0 items-center gap-2", className)}
      {...props}
    />
  );
}

// 小于该位移的触摸当作点击，不当作滑动
const SWIPE_THRESHOLD = 40;

// 长按期间允许的手指抖动量，超过即认为是滑动/拖拽
const LONG_PRESS_MOVE_TOLERANCE = 10;

export interface MobileSwipeRowProps extends React.ComponentProps<"div"> {
  /** 左滑后露出的操作块 */
  actions: React.ReactNode;
  /** 开合受控于列表：同一时刻只允许一行滑开，否则多行会同时挂着破坏性操作块 */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function MobileSwipeRow({
  actions,
  open,
  onOpenChange,
  children,
  className,
  onTouchStart,
  onTouchEnd,
  ...props
}: MobileSwipeRowProps) {
  const [offset, setOffset] = useState(0);
  const startX = useRef<number | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    startX.current = e.touches[0]?.clientX ?? null;
    onTouchStart?.(e);
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const from = startX.current;
    startX.current = null;
    const to = e.changedTouches[0]?.clientX;
    if (from !== null && to !== undefined) {
      const delta = to - from;
      if (delta <= -SWIPE_THRESHOLD) {
        // 位移量取操作区实际宽度：各页操作块数量不同，写死距离会在少一块时滑出空白
        setOffset(actionsRef.current?.offsetWidth ?? 0);
        onOpenChange(true);
      } else if (delta >= SWIPE_THRESHOLD) {
        onOpenChange(false);
      }
    }
    onTouchEnd?.(e);
  };

  return (
    <div
      data-slot="mobile-swipe-row"
      className={cn("relative overflow-hidden", className)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      {...props}
    >
      <div
        ref={actionsRef}
        data-slot="mobile-swipe-actions"
        data-state={open ? "open" : "closed"}
        aria-hidden={!open}
        // inert 与 aria-hidden 必须同进退：pointer-events-none 只挡指针，
        // 键盘仍能 Tab 进这棵不播报的子树并触发「删除」
        inert={!open}
        className={cn("absolute inset-y-0 right-0 flex items-stretch", !open && "pointer-events-none")}
      >
        {actions}
      </div>
      <div
        data-slot="mobile-swipe-content"
        // relative 不可省：操作区是 absolute，普通流的内容层会被它压住，
        // 未滑动时操作块就会盖在行右侧（挡住开关）
        className="relative bg-background transition-transform"
        style={{ transform: open ? `translateX(-${offset}px)` : undefined }}
        // 已滑开时点内容层收起而非透传为行点击：与移动端通行心智一致，
        // 也避免紧挨着删除块的误触
        onClickCapture={(e) => {
          if (!open) return;
          e.preventDefault();
          e.stopPropagation();
          onOpenChange(false);
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** 长按手势。返回的处理器整体透传给行元素即可，与左滑外壳的触摸处理可以叠加。 */
function useLongPress(onLongPress: () => void, delay = 500) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      clear();
      const touch = e.touches[0];
      origin.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
      timer.current = setTimeout(() => {
        timer.current = null;
        onLongPress();
      }, delay);
    },
    [clear, onLongPress, delay]
  );

  // 手指按住时的自然抖动有几像素，无条件取消会让长按在真机上频繁失败；
  // 超过容差才认为用户是在滑动或拖拽，把手势让出去
  const onTouchMove = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      const from = origin.current;
      const touch = e.touches[0];
      if (!from || !touch) return;
      if (Math.hypot(touch.clientX - from.x, touch.clientY - from.y) > LONG_PRESS_MOVE_TOLERANCE) clear();
    },
    [clear]
  );

  return useMemo(
    () => ({ onTouchStart, onTouchMove, onTouchEnd: clear, onTouchCancel: clear }),
    [onTouchStart, onTouchMove, clear]
  );
}

export interface MobileSelectionHeaderProps {
  selectedCount: number;
  allSelected: boolean;
  onCancel: () => void;
  onToggleSelectAll: () => void;
  className?: string;
}

/** 选择模式顶栏：取代该页原本的搜索/筛选行，右侧全选与左侧退出成对出现。 */
function MobileSelectionHeader({
  selectedCount,
  allSelected,
  onCancel,
  onToggleSelectAll,
  className,
}: MobileSelectionHeaderProps) {
  const { t } = useTranslation();
  return (
    <div
      data-slot="mobile-selection-header"
      className={cn("flex h-12 shrink-0 items-center gap-3 px-4 border-b border-border bg-card", className)}
    >
      <button
        type="button"
        aria-label={t("editor:cancel")}
        onClick={onCancel}
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground"
      >
        <X className="size-4" />
      </button>
      <span className="text-sm font-medium">{t("batch_selected", { count: selectedCount })}</span>
      <div className="flex-1" />
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        {t("script:select_all")}
        <Checkbox aria-label={t("script:select_all")} checked={allSelected} onCheckedChange={onToggleSelectAll} />
      </label>
    </div>
  );
}

/** 选择模式底部批量操作条。 */
function MobileBatchBar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="mobile-batch-bar"
      className={cn(
        "flex shrink-0 items-stretch justify-around gap-1 border-t border-border bg-card px-2 py-2 pb-[env(safe-area-inset-bottom)]",
        className
      )}
      {...props}
    />
  );
}

function MobileBatchBarButton({
  className,
  destructive,
  ...props
}: React.ComponentProps<"button"> & { destructive?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "flex flex-1 items-center justify-center rounded-md px-2 py-2 text-[13px] font-medium",
        destructive ? "text-destructive" : "text-foreground",
        className
      )}
      {...props}
    />
  );
}

export interface MobileActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 面板顶部重复列表行的标识，便于确认操作对象 */
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

// 面板由受控 open 驱动，条目自己不知道怎么关；用 context 把关闭动作交给条目，
// 免得每个消费者在每一项上重复写一次 onOpenChange(false)。
const MobileActionSheetCloseCtx = createContext<() => void>(() => {});

/** 整行点击后弹出的底部操作面板。 */
function MobileActionSheet({ open, onOpenChange, title, description, icon, children }: MobileActionSheetProps) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" data-slot="mobile-action-sheet" className="gap-0 rounded-t-xl p-0">
        <SheetHeader className="flex-row items-center gap-2.5 border-b border-border px-4 py-3 text-left">
          {icon}
          <span className="flex min-w-0 flex-col">
            <SheetTitle className="truncate text-sm">{title}</SheetTitle>
            {description !== undefined && (
              <SheetDescription className="truncate text-[11px]">{description}</SheetDescription>
            )}
          </span>
        </SheetHeader>
        <div className="flex flex-col py-1 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
          <MobileActionSheetCloseCtx.Provider value={close}>{children}</MobileActionSheetCloseCtx.Provider>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export interface MobileActionSheetItemProps extends Omit<React.ComponentProps<"button">, "onSelect"> {
  onSelect: () => void;
  destructive?: boolean;
}

function MobileActionSheetItem({ onSelect, destructive, className, ...props }: MobileActionSheetItemProps) {
  const close = useContext(MobileActionSheetCloseCtx);
  return (
    <button
      type="button"
      data-slot="mobile-action-sheet-item"
      onClick={() => {
        onSelect();
        close();
      }}
      className={cn(
        "flex items-center gap-3 px-4 py-3 text-left text-sm",
        destructive ? "text-destructive" : "text-foreground",
        className
      )}
      {...props}
    />
  );
}

export {
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
};
