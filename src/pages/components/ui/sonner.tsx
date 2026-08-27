import { Toaster as Sonner, type ToasterProps } from "sonner";
import { CircleCheck, CircleX, Info, Loader2, TriangleAlert } from "lucide-react";
import { useTheme } from "@App/pages/components/theme-provider";
import { useIsMobile } from "@App/pages/components/use-is-mobile";

/**
 * 页面版式，决定桌面端 toast 的落点。
 * - `default`：普通滚动页（options / popup / import / batchupdate 等），桌面端右下角。
 * - `decision`：install / confirm / external_access_confirm 这类「吸底操作栏 + 按钮右对齐」的决策页。
 *   右下角飘窗必然压住「安装 / 关闭 / 拒绝 / 允许」等操作按钮，故桌面端改为顶部居中，与移动端一致。
 */
export type ToasterPlacement = "default" | "decision";

export interface ScriptCatToasterProps extends ToasterProps {
  placement?: ToasterPlacement;
}

/**
 * 全局 toast 容器。基于 sonner，跟随项目主题与设计令牌。
 * 移动端始终顶部居中，桌面端落点见 `placement`；业务侧统一用 `notify`（@App/pages/components/ui/toast）触发。
 */
export function Toaster({ placement = "default", ...props }: ScriptCatToasterProps) {
  const { resolvedTheme } = useTheme();
  const isMobile = useIsMobile();
  const topCentered = isMobile || placement === "decision";

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      position={topCentered ? "top-center" : "bottom-right"}
      offset={topCentered ? { top: isMobile ? 12 : 24 } : { bottom: 24, right: 24 }}
      mobileOffset={{ top: 12, left: 12, right: 12 }}
      visibleToasts={3}
      gap={12}
      closeButton
      icons={{
        success: <CircleCheck className="size-[18px] text-success" />,
        error: <CircleX className="size-[18px] text-destructive" />,
        warning: <TriangleAlert className="size-[18px] text-warning" />,
        info: <Info className="size-[18px] text-primary" />,
        loading: <Loader2 className="size-[18px] animate-spin text-primary" />,
      }}
      toastOptions={{
        classNames: {
          // sonner v2 在 <head> 末尾 appendChild 注入默认样式，与等特异性的 Tailwind 工具类冲突时后到者胜；
          // 故对被其默认规则覆盖的视觉属性（圆角 / 左强调条宽度与色 / 阴影）用 v4 尾置 `!` 强制 important。
          toast: "group rounded-xl! border border-border border-l-4! bg-popover text-popover-foreground shadow-lg!",
          title: "text-sm! font-medium!",
          description: "text-[13px]! text-muted-foreground!",
          // sonner 默认 action 按钮是反色实心（bg=var(--normal-text)、border:none）；
          // 强制 outline 化对齐设计稿（--border 细边 + --background 底 + 前景字），供带 action 的 toast 使用。
          actionButton:
            "inline-flex! items-center! rounded-md! border! border-solid! border-border! bg-background! px-2.5! py-1! h-auto! text-[13px]! font-medium! text-popover-foreground!",
          closeButton: "text-muted-foreground",
          success: "border-l-success!",
          error: "border-l-destructive!",
          warning: "border-l-warning!",
          info: "border-l-primary!",
          loading: "border-l-primary!",
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          // sonner 默认把关闭按钮放左上角（LTR 变量），覆盖到右上角对齐设计稿
          "--toast-close-button-start": "unset",
          "--toast-close-button-end": "0",
          "--toast-close-button-transform": "translate(35%, -35%)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}
