import type React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@App/pkg/utils/cn";

// 列表行骨架：只固化行的几何与状态外观（行高、内边距、圆角、悬停/选中/禁用、操作槽的常驻半透明），
// 不认识任何业务字段。左右锚区宽度由消费者给出——脚本列表左锚有勾选/拖拽/开关，回收站只有勾选，
// 两者宽度本就不同，骨架预设宽度会立刻退化成带消费者判别参数的适配器。
const listRowVariants = cva(
  "group/row flex items-center h-14 px-3 rounded-md transition-colors hover:bg-primary/[0.08]",
  {
    variants: {
      selected: {
        true: "bg-primary/10",
        false: "",
      },
      disabled: {
        true: "opacity-60",
        false: "",
      },
    },
    defaultVariants: {
      selected: false,
      disabled: false,
    },
  }
);

type ListRowProps = React.ComponentProps<"div"> & VariantProps<typeof listRowVariants>;

function ListRow({ className, selected, disabled, ...props }: ListRowProps) {
  return <div data-slot="list-row" className={cn(listRowVariants({ selected, disabled }), className)} {...props} />;
}

function ListRowLeading({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="list-row-leading" className={cn("flex shrink-0 items-center", className)} {...props} />;
}

function ListRowMain({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="list-row-main" className={cn("flex min-w-0 flex-1 items-center gap-2.5", className)} {...props} />
  );
}

function ListRowTrailing({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="list-row-trailing" className={cn("flex shrink-0 items-center", className)} {...props} />;
}

// 常驻半透明、悬停整行转为完全不透明：保留改版前 ScriptTable 已有的可发现性，
// 触屏与键盘用户不依赖悬停也能看到操作入口。
function ListRowActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="list-row-actions"
      className={cn(
        "flex shrink-0 items-center justify-end gap-1 opacity-[0.55] transition-opacity group-hover/row:opacity-100",
        className
      )}
      {...props}
    />
  );
}

export { ListRow, ListRowLeading, ListRowMain, ListRowTrailing, ListRowActions };
