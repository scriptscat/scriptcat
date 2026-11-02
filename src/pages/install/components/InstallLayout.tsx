import { useEffect, useRef, useState } from "react";
import { Info, type LucideIcon } from "lucide-react";
import { cn } from "@App/pkg/utils/cn";
import { useIsMobile } from "@App/pages/components/use-is-mobile";
import { InstallTopBar } from "./InstallTopBar";
import { InstallErrorBar } from "./InstallErrorBar";

/** 操作组的渲染位置:桌面身份卡内 / 移动端常驻吸底栏 / 桌面身份卡滚出后才出现的吸底栏 */
export type ActionPlacement = "card" | "footer" | "sticky";

/** 桌面端交给身份卡自行摆放的插槽;移动端为 null,身份卡保持纯展示 */
export interface IdentitySlots {
  actions: React.ReactNode;
  alert: React.ReactNode;
  note: React.ReactNode;
}

export interface InstallFailure {
  message: string;
  /** 不提供则失败条不出现重试入口(如外部接入请求失败) */
  onRetry?: () => void;
}

export interface InstallLayoutProps {
  /** 顶部右侧上下文标题(如「脚本安装」「脚本更新」),由调用方按场景翻译 */
  title: string;
  /** 上下文 chip 的前导图标(安装=download / 更新=refresh / 订阅=rss / 本地=hard-drive / 技能=sparkles) */
  titleIcon?: LucideIcon;
  /** 上下文 chip 配色:默认中性灰,skill=紫色,watching=品牌蓝(配脉冲点) */
  titleTone?: "default" | "skill" | "watching";
  /** 顶栏与滚动区之间的常驻条(安装成功 ribbon):不随正文滚动,始终可读 */
  ribbon?: React.ReactNode;
  /** 安装失败:原因与重试入口须常驻可读,跟随当前可见的那组操作只渲染一份 */
  failure?: InstallFailure;
  /** 安装完成且即将自动关闭:整页淡出,「减少动态效果」下直接跳过该动画 */
  closing?: boolean;
  /** 按位置渲染操作组;sticky 是滚动中途才挂载的副本,不应抢焦点 */
  actions: (placement: ActionPlacement) => React.ReactNode;
  /** 操作说明(信任提示等),桌面端显示在身份卡底部 */
  note?: React.ReactNode;
  /** 桌面吸底栏左侧的迷你身份(图标 + 名称 + 版本) */
  summary: React.ReactNode;
  /** 正文首块的身份卡 */
  identity: (slots: IdentitySlots | null) => React.ReactNode;
  children: React.ReactNode;
}

/** 桌面吸底栏左侧的迷你身份:沿用身份卡的图标底色,滚到下方仍能认出是哪个脚本/技能 */
export function InstallSummary({
  icon,
  tone = "primary",
  name,
  version,
}: {
  icon: React.ReactNode;
  tone?: "primary" | "skill";
  name: string;
  version?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          tone === "skill" ? "bg-skill-bg" : "bg-primary-light"
        )}
      >
        {icon}
      </div>
      <span className="truncate text-sm font-semibold text-foreground">{name}</span>
      {version && (
        <span className="shrink-0 rounded-md bg-input px-1.5 py-0.5 font-mono text-xs text-foreground">{`v${version}`}</span>
      )}
    </div>
  );
}

export function InstallLayout({
  title,
  titleIcon,
  titleTone = "default",
  ribbon,
  failure,
  closing,
  actions,
  note,
  summary,
  identity,
  children,
}: InstallLayoutProps) {
  const isMobile = useIsMobile();
  const contentRef = useRef<HTMLElement>(null);
  const [cardActions, setCardActions] = useState<HTMLDivElement | null>(null);
  // 观测结果绑定到被观测的那个节点:跨过移动断点后操作组节点重建,旧节点的「已滚出」不能沿用;
  // 新节点在首次回调前按「可见」处理,身份卡在正文顶部,不应闪出吸底栏
  const [observed, setObserved] = useState<{ target: Element; visible: boolean } | null>(null);
  const cardActionsVisible = observed?.target !== cardActions || observed.visible;

  useEffect(() => {
    if (!cardActions) return;
    const observer = new IntersectionObserver(
      (entries) => {
        // 回调排队期间同一节点可能累积多条记录,按时间先后排列,只有最后一条是当前状态
        const latest = entries[entries.length - 1];
        setObserved({ target: latest.target, visible: latest.isIntersecting });
      },
      { root: contentRef.current }
    );
    observer.observe(cardActions);
    return () => observer.disconnect();
  }, [cardActions]);

  const sticky = !isMobile && !cardActionsVisible;
  // 吸底栏消失也要走退出动画:sticky 转 false 后保留节点,直到它自身的动画结束才卸载
  const [stickyMounted, setStickyMounted] = useState(false);
  if (sticky && !stickyMounted) {
    setStickyMounted(true);
  }
  // 移动端换成常驻吸底栏,桌面吸底栏直接卸掉,回到桌面时不补播一次退出动画
  if (isMobile && stickyMounted) {
    setStickyMounted(false);
  }
  const errorBar = (inset: boolean) =>
    failure && <InstallErrorBar message={failure.message} onRetry={failure.onRetry} inset={inset} />;

  const slots: IdentitySlots | null = isMobile
    ? null
    : {
        actions: (
          <div data-testid="card-actions" ref={setCardActions}>
            {actions("card")}
          </div>
        ),
        alert: sticky ? null : errorBar(true),
        note: note && (
          <p data-testid="action-note" className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <Info className="size-[15px] shrink-0" aria-hidden="true" />
            <span>{note}</span>
          </p>
        ),
      };

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

      <main ref={contentRef} data-testid="content-area" className="min-h-0 flex-1 overflow-y-auto px-6 py-7">
        <div className="mx-auto flex w-full max-w-[864px] flex-col gap-4">
          {identity(slots)}
          {children}
        </div>
      </main>

      {isMobile ? (
        <footer
          data-testid="action-bar"
          className="sticky bottom-0 z-10 flex shrink-0 flex-col border-t border-border bg-card/95 backdrop-blur"
        >
          {errorBar(false)}
          <div className="flex min-h-[68px] items-center px-8 py-3">{actions("footer")}</div>
        </footer>
      ) : (
        stickyMounted && (
          <footer
            data-testid="action-bar"
            className={cn(
              "sticky bottom-0 z-10 shrink-0 border-t border-border bg-card/95 px-6 backdrop-blur",
              sticky
                ? "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200 motion-safe:ease-out"
                : // 退出动画不能加 motion-safe:否则「减少动态效果」下没有 animationend,节点永远卸不掉;
                  // 全局 reduced-motion 规则会把它压到近乎瞬时
                  "animate-out fade-out slide-out-to-bottom-2 fill-mode-forwards duration-200 ease-out"
            )}
            // 退出中的副本与身份卡里的操作组、失败条同时存在,不能再被点到或被读屏重复播报
            inert={!sticky}
            onAnimationEnd={(e) => {
              // 下拉菜单等子元素的动画事件经 React 树冒泡上来,只认吸底栏自身的退出
              if (e.target === e.currentTarget && !sticky) setStickyMounted(false);
            }}
          >
            <div className="mx-auto flex w-full max-w-[864px] flex-col gap-2.5 py-2.5">
              {errorBar(true)}
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">{summary}</div>
                {actions("sticky")}
              </div>
            </div>
          </footer>
        )
      )}
    </div>
  );
}
