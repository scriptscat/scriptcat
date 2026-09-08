import type { LucideIcon } from "lucide-react";
import { cn } from "@App/pkg/utils/cn";
import { InstallTopBar } from "./InstallTopBar";

export interface InstallLayoutProps {
  /** 顶部右侧上下文标题(如「脚本安装」「脚本更新」),由调用方按场景翻译 */
  title: string;
  /** 上下文 chip 的前导图标(安装=download / 更新=refresh / 订阅=rss / 本地=hard-drive / 技能=sparkles) */
  titleIcon?: LucideIcon;
  /** 上下文 chip 配色:默认中性灰,skill=紫色,watching=品牌蓝(配脉冲点) */
  titleTone?: "default" | "skill" | "watching";
  /** 顶栏与滚动区之间的常驻条(安装成功 ribbon):不随正文滚动,始终可读 */
  ribbon?: React.ReactNode;
  /** 吸底操作栏内、按钮行正上方的内联提示条(安装失败错误条) */
  alert?: React.ReactNode;
  /** 安装完成且即将自动关闭:整页淡出,「减少动态效果」下直接跳过该动画 */
  closing?: boolean;
  /** 吸底操作栏内容 */
  actions: React.ReactNode;
  children: React.ReactNode;
}

export function InstallLayout({
  title,
  titleIcon,
  titleTone = "default",
  ribbon,
  alert,
  closing,
  actions,
  children,
}: InstallLayoutProps) {
  return (
    <div
      data-testid="install-layout"
      className={cn(
        "flex h-dvh flex-col bg-background",
        // 淡出与关闭定时器同长:延迟让「✓ 已安装」那一帧先被看见,再走完整页淡出
        "motion-safe:transition-opacity motion-safe:delay-250 motion-safe:duration-450 motion-safe:ease-out",
        closing && "motion-safe:opacity-0"
      )}
    >
      <InstallTopBar title={title} titleIcon={titleIcon} titleTone={titleTone} />

      {ribbon}

      <main data-testid="content-area" className="min-h-0 flex-1 overflow-y-auto px-6 py-7">
        <div className="mx-auto flex w-full max-w-[864px] flex-col gap-4">{children}</div>
      </main>

      <footer
        data-testid="action-bar"
        className="sticky bottom-0 z-10 flex shrink-0 flex-col border-t border-border bg-card/95 backdrop-blur"
      >
        {alert}
        <div className="flex min-h-[68px] items-center px-8 py-3">{actions}</div>
      </footer>
    </div>
  );
}
