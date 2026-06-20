import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@App/pages/components/ui/button";

// Agent 管理页统一 64px 页头：图标块 + 标题/副标题 + 右侧操作区（可选「文档」按钮 + actions 插槽）
export function AgentPageHeader({
  icon: Icon,
  title,
  subtitle,
  docHref,
  docLabel,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  // 传入文档链接时，在操作区前渲染统一的「文档」外框按钮
  docHref?: string;
  docLabel?: string;
  actions?: ReactNode;
}) {
  const { t } = useTranslation("agent");
  return (
    <div className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-7">
      <div className="flex items-center gap-3">
        <div className="flex size-[34px] items-center justify-center rounded-[9px] bg-primary/10">
          <Icon className="size-[18px] text-primary" />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-base font-semibold text-foreground">{title}</span>
          <span className="text-xs text-fg-secondary">{subtitle}</span>
        </div>
      </div>
      {(docHref || actions) && (
        <div className="flex items-center gap-2.5">
          {docHref && (
            <Button variant="outline" asChild>
              <a data-testid="page-header-docs" href={docHref} target="_blank" rel="noreferrer">
                <BookOpen className="size-4" />
                {docLabel ?? t("agent:docs")}
              </a>
            </Button>
          )}
          {actions}
        </div>
      )}
    </div>
  );
}
