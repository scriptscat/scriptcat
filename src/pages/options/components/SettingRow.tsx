import type React from "react";

export function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    // 移动端(<768px)竖排：控件宽度固定，横排会把文案挤成每行一两个字（issue #1555）
    <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center md:justify-between md:gap-4">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[13px] font-medium text-foreground">{label}</span>
        {description && <span className="text-xs text-muted-foreground">{description}</span>}
      </div>
      <div className="flex items-center gap-2 md:shrink-0">{children}</div>
    </div>
  );
}
