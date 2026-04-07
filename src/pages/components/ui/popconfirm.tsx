import { useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "./popover";
import { Button } from "./button";

interface PopconfirmProps {
  /** 确认提示文案 */
  description: string;
  /** 确认回调 */
  onConfirm: () => void;
  /** 使用危险按钮样式 */
  destructive?: boolean;
  /** 确认按钮文字，默认"确定" */
  confirmText?: string;
  /** 取消按钮文字，默认"取消" */
  cancelText?: string;
  /** 弹出方向 */
  side?: "top" | "bottom" | "left" | "right";
  /** 对齐方式 */
  align?: "start" | "center" | "end";
  children: React.ReactNode;
}

/**
 * 气泡确认组件。
 * 包裹触发元素，点击后弹出确认气泡（类似 Arco Popconfirm）。
 * 内部使用 grid 布局确保子元素完全撑满，不影响 hover 效果。
 */
export function Popconfirm({
  description,
  onConfirm,
  destructive,
  confirmText = "确定",
  cancelText = "取消",
  side = "top",
  align = "start",
  children,
}: PopconfirmProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="grid">{children}</div>
      </PopoverTrigger>
      <PopoverContent className="w-auto max-w-[260px] p-3" side={side} align={align} sideOffset={4}>
        <p className="text-[13px] mb-3">{description}</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="xs" onClick={() => setOpen(false)}>
            {cancelText}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            size="xs"
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
          >
            {confirmText}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
