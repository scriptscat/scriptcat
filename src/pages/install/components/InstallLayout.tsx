import type { LucideIcon } from "lucide-react";
import { InstallTopBar } from "./InstallTopBar";

export interface InstallLayoutProps {
  /** 顶部右侧上下文标题(如「脚本安装」「脚本更新」),由调用方按场景翻译 */
  title: string;
  /** 上下文 chip 的前导图标(安装=download / 更新=refresh / 订阅=rss / 本地=hard-drive / 技能=sparkles) */
  titleIcon?: LucideIcon;
  /** 上下文 chip 配色:默认中性灰,skill=紫色,watching=品牌蓝(配脉冲点) */
  titleTone?: "default" | "skill" | "watching";
  /** 吸底操作栏内容 */
  actions: React.ReactNode;
  children: React.ReactNode;
}

export function InstallLayout({ title, titleIcon, titleTone = "default", actions, children }: InstallLayoutProps) {
  return (
    <div data-testid="install-layout" className="flex h-screen flex-col bg-background">
      <InstallTopBar title={title} titleIcon={titleIcon} titleTone={titleTone} />

      <main data-testid="content-area" className="min-h-0 flex-1 overflow-y-auto px-6 py-7">
        <div className="mx-auto flex w-full max-w-[864px] flex-col gap-4">{children}</div>
      </main>

      <footer
        data-testid="action-bar"
        className="sticky bottom-0 z-10 flex min-h-[68px] shrink-0 items-center border-t border-border bg-card/95 px-8 py-3 backdrop-blur"
      >
        {actions}
      </footer>
    </div>
  );
}
