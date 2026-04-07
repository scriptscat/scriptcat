import { useCallback, useRef, useState } from "react";

/**
 * 为 Radix DropdownMenu 提供 hover 触发能力。
 * 通过引用计数追踪鼠标是否在菜单树（trigger / content / subcontent）的任何部分内，
 * 配合延迟关闭解决 Portal 间隙问题。
 *
 * @param closeDelay 鼠标离开后的关闭延迟（ms），默认 300
 *
 * @example
 * ```tsx
 * const { rootProps, hoverProps, contentProps, close } = useHoverMenu();
 *
 * <DropdownMenu {...rootProps}>
 *   <DropdownMenuTrigger asChild>
 *     <button {...hoverProps}>触发</button>
 *   </DropdownMenuTrigger>
 *   <DropdownMenuContent {...contentProps}>
 *     <DropdownMenuSub>
 *       <DropdownMenuSubTrigger>子菜单</DropdownMenuSubTrigger>
 *       <DropdownMenuSubContent {...hoverProps}>
 *         <DropdownMenuItem onClick={() => { close(); doSomething(); }}>
 *           操作
 *         </DropdownMenuItem>
 *       </DropdownMenuSubContent>
 *     </DropdownMenuSub>
 *   </DropdownMenuContent>
 * </DropdownMenu>
 * ```
 */
export function useHoverMenu(closeDelay = 300) {
  const [isOpen, setIsOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hoverCount = useRef(0);

  const handleEnter = useCallback(() => {
    hoverCount.current++;
    clearTimeout(closeTimer.current);
    setIsOpen(true);
  }, []);

  const handleLeave = useCallback(() => {
    hoverCount.current--;
    closeTimer.current = setTimeout(() => {
      if (hoverCount.current <= 0) {
        hoverCount.current = 0;
        setIsOpen(false);
      }
    }, closeDelay);
  }, [closeDelay]);

  const close = useCallback(() => {
    setIsOpen(false);
    hoverCount.current = 0;
  }, []);

  const preventEvent = useCallback((e: { preventDefault: () => void }) => {
    e.preventDefault();
  }, []);

  /** 展开到 DropdownMenu 根组件 */
  const rootProps = {
    open: isOpen,
    onOpenChange: (open: boolean) => {
      if (open) setIsOpen(true);
    },
    modal: false as const,
  };

  /** 展开到需要 hover 追踪的元素（trigger、SubContent 等） */
  const hoverProps = {
    onMouseEnter: handleEnter,
    onMouseLeave: handleLeave,
  };

  /** 展开到 DropdownMenuContent，包含 hover 追踪 + Radix dismiss 拦截 */
  const contentProps = {
    ...hoverProps,
    onPointerDownOutside: preventEvent,
    onInteractOutside: preventEvent,
    onCloseAutoFocus: preventEvent,
    onEscapeKeyDown: close,
  };

  return { isOpen, close, rootProps, hoverProps, contentProps };
}
