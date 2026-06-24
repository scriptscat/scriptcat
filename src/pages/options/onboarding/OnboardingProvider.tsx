import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSystemConfig } from "@App/pages/options/hooks/useSystemConfig";
import { useIsMobile } from "@App/pages/components/use-is-mobile";
import { DESKTOP_STEPS, MOBILE_STEPS } from "./steps";
import type { OnboardingContextValue, OnboardingPhase } from "./types";

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be used within OnboardingProvider");
  return ctx;
}

const isIncognito = () => Boolean(chrome?.extension?.inIncognitoContext);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [done, setDone] = useSystemConfig("onboarding_done");
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();

  const [phase, setPhase] = useState<OnboardingPhase | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [autoChecked, setAutoChecked] = useState(false);
  const initialPath = useRef("/");

  const mode = isMobile ? "mobile" : "desktop";
  const steps = isMobile ? MOBILE_STEPS : DESKTOP_STEPS;

  // 配置异步就绪后按条件自动打开欢迎（仅一次）。
  // 用「渲染期受保护地调整 state」而非 effect：既规避 react-hooks/set-state-in-effect，
  // 又正确处理 done 由 undefined→false 的异步加载（lazy initializer 会漏掉异步到达的值）。
  if (!autoChecked && done !== undefined) {
    setAutoChecked(true);
    if (done === false && !isIncognito() && !location.pathname.startsWith("/script/editor")) {
      setPhase("welcome");
    }
  }

  // mode 切换时钳制 stepIndex（派生计算，不需 effect）
  const clampedIndex = Math.min(stepIndex, steps.length - 1);

  const markDone = () => {
    if (!isIncognito()) setDone(true);
  };

  const close = () => {
    setPhase(null);
    setStepIndex(0);
  };

  const goToStep = (i: number) => {
    const idx = Math.max(0, Math.min(i, steps.length - 1));
    setStepIndex(idx);
    const route = steps[idx]?.route;
    if (route && route !== location.pathname) void navigate(route);
  };

  const value: OnboardingContextValue = useMemo(() => {
    const start = () => setPhase("welcome");
    const startTour = () => {
      initialPath.current = location.pathname;
      setPhase("tour");
      goToStep(0);
    };
    const next = () => {
      if (clampedIndex >= steps.length - 1) {
        markDone();
        close();
        void navigate(initialPath.current);
      } else {
        goToStep(clampedIndex + 1);
      }
    };
    const prev = () => goToStep(clampedIndex - 1);
    const skip = () => {
      markDone();
      close();
      if (phase === "tour") void navigate(initialPath.current);
    };
    const finish = () => {
      markDone();
      close();
      void navigate(initialPath.current);
    };
    return {
      phase,
      mode,
      steps,
      stepIndex: clampedIndex,
      currentStep: phase === "tour" ? (steps[clampedIndex] ?? null) : null,
      demoActive: phase === "tour",
      start,
      startTour,
      next,
      prev,
      skip,
      finish,
      goToStep,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, mode, steps, clampedIndex, location.pathname]);

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

/** 供非引导组件（如脚本列表）安全读取演示开关：无 Provider 时返回 false，不抛错。 */
export function useOnboardingDemoActive(): boolean {
  return useContext(OnboardingContext)?.demoActive ?? false;
}
