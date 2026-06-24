import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const setDone = vi.fn();
let doneValue: boolean | undefined = false;
vi.mock("@App/pages/options/hooks/useSystemConfig", () => ({
  useSystemConfig: () => [doneValue, setDone],
}));
let mobile = false;
vi.mock("@App/pages/components/use-is-mobile", () => ({ useIsMobile: () => mobile }));

import { OnboardingProvider, useOnboarding, useOnboardingDemoActive } from "./OnboardingProvider";

function Harness() {
  const o = useOnboarding();
  return (
    <div>
      <span data-testid="phase">{String(o.phase)}</span>
      <span data-testid="idx">{o.stepIndex}</span>
      <span data-testid="len">{o.steps.length}</span>
      <span data-testid="demo">{String(o.demoActive)}</span>
      <button onClick={o.start}>{"start"}</button>
      <button onClick={o.startTour}>{"startTour"}</button>
      <button onClick={o.next}>{"next"}</button>
      <button onClick={o.prev}>{"prev"}</button>
      <button onClick={o.skip}>{"skip"}</button>
    </div>
  );
}

function renderApp(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <OnboardingProvider>
        <Harness />
      </OnboardingProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  doneValue = false;
  mobile = false;
  (chrome.extension as unknown as { inIncognitoContext: boolean }).inIncognitoContext = false;
  setDone.mockReset();
});
afterEach(cleanup);

describe("新手引导控制器", () => {
  it("首次进入非隐身时应自动打开欢迎", () => {
    renderApp();
    expect(screen.getByTestId("phase").textContent).toBe("welcome");
  });

  it("已看过时不应自动打开", () => {
    doneValue = true;
    renderApp();
    expect(screen.getByTestId("phase").textContent).toBe("null");
  });

  it("隐身模式不应自动打开且不写入标志", () => {
    (chrome.extension as unknown as { inIncognitoContext: boolean }).inIncognitoContext = true;
    renderApp();
    expect(screen.getByTestId("phase").textContent).toBe("null");
    fireEvent.click(screen.getByText("start"));
    fireEvent.click(screen.getByText("skip"));
    expect(setDone).not.toHaveBeenCalled();
  });

  it("从欢迎开始导览应进入巡览第一步", () => {
    renderApp();
    fireEvent.click(screen.getByText("startTour"));
    expect(screen.getByTestId("phase").textContent).toBe("tour");
    expect(screen.getByTestId("idx").textContent).toBe("0");
  });

  it("下一步/上一步应在边界内钳制", () => {
    renderApp();
    fireEvent.click(screen.getByText("startTour"));
    fireEvent.click(screen.getByText("prev"));
    expect(screen.getByTestId("idx").textContent).toBe("0");
    fireEvent.click(screen.getByText("next"));
    expect(screen.getByTestId("idx").textContent).toBe("1");
  });

  it("跳过应置位并关闭", () => {
    renderApp();
    fireEvent.click(screen.getByText("skip"));
    expect(setDone).toHaveBeenCalledWith(true);
    expect(screen.getByTestId("phase").textContent).toBe("null");
  });

  it("移动模式应使用移动步骤集（3 步）", () => {
    mobile = true;
    renderApp();
    expect(screen.getByTestId("len").textContent).toBe("3");
  });

  it("走到最后一步再下一步应置位并关闭", () => {
    renderApp();
    fireEvent.click(screen.getByText("startTour"));
    const total = Number(screen.getByTestId("len").textContent);
    // 点击 total 次 next：前 (total-1) 次推进步骤，第 total 次触发 finish
    for (let i = 0; i < total; i++) {
      fireEvent.click(screen.getByText("next"));
    }
    expect(setDone).toHaveBeenCalledWith(true);
    expect(screen.getByTestId("phase").textContent).toBe("null");
  });

  it("配置异步加载完成后（undefined→false）应自动打开欢迎", () => {
    doneValue = undefined;
    const view = renderApp(); // 初始：done 为 undefined → 不应打开
    expect(view.getByTestId("phase").textContent).toBe("null");
    doneValue = false;
    view.rerender(
      <MemoryRouter initialEntries={["/"]}>
        <OnboardingProvider>
          <Harness />
        </OnboardingProvider>
      </MemoryRouter>
    );
    expect(view.getByTestId("phase").textContent).toBe("welcome");
  });
});

describe("演示数据开关", () => {
  it("welcome 阶段 demoActive 为假，tour 阶段为真", () => {
    renderApp();
    expect(screen.getByTestId("demo").textContent).toBe("false");
    fireEvent.click(screen.getByText("startTour"));
    expect(screen.getByTestId("demo").textContent).toBe("true");
  });

  it("无 Provider 时 useOnboardingDemoActive 返回 false 且不抛错", () => {
    function Probe() {
      return <span data-testid="demo">{String(useOnboardingDemoActive())}</span>;
    }
    render(<Probe />);
    expect(screen.getByTestId("demo").textContent).toBe("false");
  });
});
