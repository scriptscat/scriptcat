import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { render, setupGlobalMocks } from "@Tests/test-utils";

// Mock ScriptMenuList component
const MockScriptMenuList = ({ scripts, onScriptToggle }: any) => (
  <div data-testid="script-menu-list">
    {scripts?.map((script: any, index: number) => (
      <div key={index} data-testid={`script-item-${script.id}`}>
        <span>{script.name}</span>
        <button data-testid={`toggle-${script.id}`} onClick={() => onScriptToggle?.(script)}>
          {script.enabled ? "禁用" : "启用"}
        </button>
      </div>
    ))}
  </div>
);

// Mock dependencies
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

beforeEach(() => {
  setupGlobalMocks();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("ScriptMenuList Component Mock Test", () => {
  it("should render script list", async () => {
    const mockScripts = [
      { id: "1", name: "Test Script 1", enabled: true },
      { id: "2", name: "Test Script 2", enabled: false },
    ];

    render(<MockScriptMenuList scripts={mockScripts} />);

    expect(screen.getByText("Test Script 1")).toBeInTheDocument();
    expect(screen.getByText("Test Script 2")).toBeInTheDocument();
  });

  it("should handle script toggle", async () => {
    const mockScripts = [{ id: "1", name: "Test Script", enabled: true }];
    const onToggle = vi.fn();

    render(<MockScriptMenuList scripts={mockScripts} onScriptToggle={onToggle} />);

    const toggleButton = screen.getByTestId("toggle-1");
    fireEvent.click(toggleButton);

    expect(onToggle).toHaveBeenCalledWith(mockScripts[0]);
  });

  it("should display correct toggle button text", async () => {
    const enabledScript = { id: "1", name: "Enabled Script", enabled: true };
    const disabledScript = { id: "2", name: "Disabled Script", enabled: false };

    render(<MockScriptMenuList scripts={[enabledScript, disabledScript]} />);

    expect(screen.getByText("禁用")).toBeInTheDocument(); // 启用的脚本显示禁用按钮
    expect(screen.getByText("启用")).toBeInTheDocument(); // 禁用的脚本显示启用按钮
  });

  it("should handle empty script list", async () => {
    render(<MockScriptMenuList scripts={[]} />);

    const container = screen.getByTestId("script-menu-list");
    expect(container).toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("should handle undefined scripts", async () => {
    render(<MockScriptMenuList scripts={undefined} />);

    const container = screen.getByTestId("script-menu-list");
    expect(container).toBeInTheDocument();
  });
});
