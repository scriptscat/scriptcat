import type React from "react";

export function SettingRow({
  label,
  description,
  icon,
  children,
}: {
  label: string;
  description?: string;
  /** Optional leading icon before the label (design: 权限策略 行前导图标). */
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[13px] font-medium text-foreground">{label}</span>
          {description && <span className="text-xs text-muted-foreground">{description}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">{children}</div>
    </div>
  );
}
