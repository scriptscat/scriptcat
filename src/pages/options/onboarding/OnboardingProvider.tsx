import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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

// 首次进入标志（localStorage，设备独立、不跨设备同步）：firstUse 为 null 即首次，标记完成写 "false"。
const isFirstUse = () => localStorage.getItem("firstUse") === null;
const markFirstUseDone = () => localStorage.setItem("firstUse", "false");

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();

  // 首次（非隐身、非全屏编辑器）进入时自动弹欢迎。firstUse 同步可读，用 lazy initializer 一次判定即可。
  const [phase, setPhase] = useState<OnboardingPhase | null>(() =>
    isFirstUse() && !isIncognito() && !location.pathname.startsWith("/script/editor") ? "welcome" : null
  );
  const [stepIndex, setStepIndex] = useState(0);
  const initialPath = useRef("/");

  const mode = isMobile ? "mobile" : "desktop";
  const steps = isMobile ? MOBILE_STEPS : DESKTOP_STEPS;

  // mode 切换时钳制 stepIndex（派生计算，不需 effect）
  const clampedIndex = Math.min(stepIndex, steps.length - 1);

  const markDone = () => {
    if (!isIncognito()) markFirstUseDone();
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
