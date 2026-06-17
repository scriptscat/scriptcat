import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "@App/pages/components/theme-provider";

/**
 * 全局 toast 容器。基于 sonner，跟随项目主题（亮/暗）。
 * 在各页面入口（main.tsx）挂载一次即可，业务侧用 `toast()` / `toast.success()` 等触发。
 */
export function Toaster({ ...props }: ToasterProps) {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      position="bottom-right"
      richColors
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}
