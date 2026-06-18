import type { LucideIcon } from "lucide-react";
import { cn } from "@App/pkg/utils/cn";

export interface InstallTopBarProps {
  /** 上下文 chip 文案(如「脚本安装」「脚本更新」),由调用方按场景翻译;省略则不渲染 chip */
  title?: string;
  /** 上下文 chip 的前导图标(安装=download / 更新=refresh / 订阅=rss / 本地=hard-drive / 技能=sparkles) */
  titleIcon?: LucideIcon;
  /** 上下文 chip 配色:默认中性灰,skill=紫色,watching=品牌蓝(配脉冲点) */
  titleTone?: "default" | "skill" | "watching";
}

/** 品牌标志:纯品牌色圆点 + ScriptCat 字样(对照设计稿,圆点内不放字母) */
function BrandMark() {
  return (
    <div className="flex items-center gap-2">
      <div className="size-6 shrink-0 rounded-full bg-primary" />
      <span className="text-base font-semibold text-foreground">{"ScriptCat"}</span>
    </div>
  );
}

/** 安装页统一顶栏:品牌标志 + 右侧上下文 chip。安装/订阅/技能/加载/失败各态共用,保证外壳一致。 */
export function InstallTopBar({ title, titleIcon: TitleIcon, titleTone = "default" }: InstallTopBarProps) {
  return (
    <header
      data-testid="install-top-bar"
      className="sticky top-0 z-10 flex h-[52px] shrink-0 items-center gap-3 border-b border-border bg-card/95 px-6 backdrop-blur"
    >
      <BrandMark />
      {title && (
        <span
          className={cn(
            "ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
            titleTone === "skill"
              ? "bg-skill-bg text-skill"
              : titleTone === "watching"
                ? "bg-primary-light text-primary"
                : "bg-muted text-fg-secondary"
          )}
        >
          {titleTone === "watching" ? (
            <span className="relative flex size-2 shrink-0 items-center justify-center" aria-hidden="true">
              <span className="absolute inline-flex size-2 animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex size-[7px] rounded-full bg-primary" />
            </span>
          ) : (
            TitleIcon && <TitleIcon className="size-3.5 shrink-0" />
          )}
          {title}
        </span>
      )}
    </header>
  );
}
