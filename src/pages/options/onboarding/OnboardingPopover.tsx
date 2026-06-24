import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@App/pages/components/ui/button";
import { useOnboarding } from "./OnboardingProvider";
import { renderGuideContent } from "./guide-content";
import { observeTarget } from "./observe-target";

const GAP = 12;
const CARD_W = 300;

export function OnboardingPopover() {
  const { t } = useTranslation();
  const { currentStep, stepIndex, steps, next, prev, skip, finish } = useOnboarding();
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const popoverRef = useRef<HTMLDivElement>(null);

  // 焦点管理：挂载时保存焦点，卸载时恢复；同时监听 Esc 退出巡览
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const skipRef = { current: skip };
    skipRef.current = skip;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") skipRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅挂载一次；skip 通过 ref 捕获以保持稳定
  }, []);

  // 每步聚焦气泡，使屏幕阅读器可感知内容变化
  useEffect(() => {
    popoverRef.current?.focus();
  }, [stepIndex]);

  useLayoutEffect(() => {
    if (!currentStep) return;
    let el: Element | null = null;
    const place = () => {
      const rect = el ? el.getBoundingClientRect() : null;
      if (!rect) {
        setPos({ left: window.innerWidth / 2 - CARD_W / 2, top: window.innerHeight / 2 - 80 });
        return;
      }
      const placement = currentStep.placement ?? "bottom";
      let left = rect.left;
      let top = rect.bottom + GAP;
      if (placement === "top") top = rect.top - GAP - 140;
      if (placement === "right") {
        left = rect.right + GAP;
        top = rect.top;
      }
      if (placement === "left") {
        left = rect.left - GAP - CARD_W;
        top = rect.top;
      }
      left = Math.max(GAP, Math.min(left, window.innerWidth - CARD_W - GAP));
      top = Math.max(GAP, top);
      setPos({ left, top });
    };
    const stop = observeTarget(currentStep.target, (found) => {
      el = found;
      place();
    });
    // 跟随目标：窗口缩放或滚动时按目标最新位置重新定位（与聚光灯遮罩保持一致）
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      stop();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [currentStep, stepIndex]);

  if (!currentStep) return null;
  const isLast = stepIndex >= steps.length - 1;

  return (
    <div
      ref={popoverRef}
      tabIndex={-1}
      role="dialog"
      aria-label={t(currentStep.titleKey)}
      style={{ position: "fixed", left: pos.left, top: pos.top, width: CARD_W, zIndex: 10001 }}
      className="flex flex-col gap-2 rounded-xl border border-border bg-popover p-4 shadow-lg outline-none"
    >
      <span className="text-[15px] font-bold text-popover-foreground">{t(currentStep.titleKey)}</span>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        {renderGuideContent(t(currentStep.contentKey))}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {t("guide:tour_progress", { current: stepIndex + 1, total: steps.length })}
        </span>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={skip}>
          {t("common:skip")}
        </Button>
        {stepIndex > 0 && (
          <Button variant="outline" size="sm" onClick={prev}>
            {t("common:back")}
          </Button>
        )}
        <Button size="sm" onClick={isLast ? finish : next}>
          {isLast ? t("guide:tour_finish") : t("common:next")}
        </Button>
      </div>
    </div>
  );
}
