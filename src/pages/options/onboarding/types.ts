export type OnboardingPhase = "welcome" | "tour";
export type OnboardingMode = "desktop" | "mobile";

export interface TourStep {
  id: string;
  /** data-tour 属性值；"center" 表示无目标、居中展示 */
  target: string;
  /** 展示该步骤前需切换到的路由（react-router 路径） */
  route?: string;
  titleKey: string;
  contentKey: string;
  placement?: "top" | "bottom" | "left" | "right";
}

export interface OnboardingContextValue {
  phase: OnboardingPhase | null;
  mode: OnboardingMode;
  steps: TourStep[];
  stepIndex: number;
  currentStep: TourStep | null;
  demoActive: boolean;
  start: () => void;
  startTour: () => void;
  next: () => void;
  prev: () => void;
  skip: () => void;
  finish: () => void;
  goToStep: (i: number) => void;
}
