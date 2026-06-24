import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useOnboarding } from "./OnboardingProvider";
import { spotlightBox, type Box } from "./geometry";
import { observeTarget } from "./observe-target";

export function OnboardingOverlay() {
  const { currentStep, stepIndex } = useOnboarding();
  const [box, setBox] = useState<Box | null>(null);

  useLayoutEffect(() => {
    if (!currentStep) return;
    let el: Element | null = null;
    const recompute = () => {
      if (!el) {
        setBox(null);
        return;
      }
      el.scrollIntoView({ block: "center", behavior: "auto" });
      setBox(spotlightBox(el.getBoundingClientRect()));
    };
    const stop = observeTarget(currentStep.target, (found) => {
      el = found;
      recompute();
    });
    window.addEventListener("resize", recompute);
    window.addEventListener("scroll", recompute, true);
    return () => {
      stop();
      window.removeEventListener("resize", recompute);
      window.removeEventListener("scroll", recompute, true);
    };
  }, [currentStep, stepIndex]);

  if (!currentStep) return null;

  const maskId = "onboarding-mask";
  return createPortal(
    // 拦截整屏点击：巡览期间屏蔽对底层（演示）列表的操作，防止 demo-* 脚本被误触发真实 GM/SW 动作
    <div style={{ position: "fixed", inset: 0, zIndex: 10000, pointerEvents: "auto" }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
        <defs>
          <mask id={maskId}>
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {box && <rect x={box.x} y={box.y} width={box.width} height={box.height} rx="8" fill="black" />}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" style={{ fill: "var(--overlay)" }} mask={`url(#${maskId})`} />
        {box && (
          <rect
            data-testid="onboarding-spotlight"
            x={box.x}
            y={box.y}
            width={box.width}
            height={box.height}
            rx="8"
            fill="none"
            style={{ stroke: "var(--primary)" }}
            strokeWidth="2"
          />
        )}
      </svg>
    </div>,
    document.body
  );
}
